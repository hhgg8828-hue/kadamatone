import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser, loginAdmin } from './helpers.js';
test('V84.0: طلبا دفع متزامنان لا يستطيعان تسوية الاستحقاق نفسه مرتين', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v840-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم تسوية' } });
        const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
        const serviceId = t.app.db.get("SELECT id FROM services WHERE slug='custom-request'")?.id;
        assert.ok(providerId && serviceId);
        const now = new Date().toISOString();
        const locationId = `loc-v840-${Date.now()}`;
        const orderId = `order-v840-${Date.now()}`;
        const settlementId = `settlement-v840-${Date.now()}`;
        t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
        t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,currency,payment_method,attachments,settlement_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V840-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'COMPLETED', 'NORMAL', 'اختبار منع تكرار التسوية', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 'YER', 'CASH', '[]', 'DUE', now, now);
        t.app.db.run(`INSERT INTO provider_settlements(id,order_id,provider_id,gross_amount,commission_rate,commission_amount,payout_amount,currency,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, settlementId, orderId, providerId, 10000, 10, 1000, 9000, 'YER', 'DUE', now, now, now);
        const adminToken = await loginAdmin(t.api);
        const results = await Promise.all([
            t.api('POST', `/api/v1/admin/settlements/${settlementId}/pay`, { token: adminToken, body: { note: 'دفع اختبار A' } }),
            t.api('POST', `/api/v1/admin/settlements/${settlementId}/pay`, { token: adminToken, body: { note: 'دفع اختبار B' } }),
        ]);
        assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => `${r.status}: ${r.text}`).join('\n'));
        assert.equal(results.filter((r) => r.status === 409).length, 1, results.map((r) => `${r.status}: ${r.text}`).join('\n'));
        const settlement = t.app.db.get('SELECT status,paid_by,paid_at FROM provider_settlements WHERE id=?', settlementId);
        assert.equal(settlement.status, 'PAID');
        assert.ok(settlement.paid_by);
        assert.ok(settlement.paid_at);
        assert.equal(t.app.db.get('SELECT settlement_status FROM orders WHERE id=?', orderId)?.settlement_status, 'PAID');
    }
    finally {
        await t.close();
    }
});
test('V84.0: صفحات التطبيق وذاكرة التخزين المؤقت تستخدم إصدار الأصول الحالي', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.10'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-10'));
});
test('V84.1: لا تُدفع تسوية إذا كانت حالة الطلب أو الاستحقاق غير متطابقة', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v841-mismatch-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم غير متطابق' } });
        const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
        const serviceId = t.app.db.get("SELECT id FROM services WHERE slug='custom-request'")?.id;
        const now = new Date().toISOString();
        const locationId = `loc-v841-${Date.now()}`;
        const orderId = `order-v841-${Date.now()}`;
        const settlementId = `settlement-v841-${Date.now()}`;
        t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
        t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,currency,payment_method,attachments,settlement_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V841-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'CANCELLED', 'NORMAL', 'اختبار عدم تطابق التسوية', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 'YER', 'CASH', '[]', 'DUE', now, now);
        t.app.db.run(`INSERT INTO provider_settlements(id,order_id,provider_id,gross_amount,commission_rate,commission_amount,payout_amount,currency,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, settlementId, orderId, providerId, 10000, 10, 1000, 9000, 'YER', 'DUE', now, now, now);
        const adminToken = await loginAdmin(t.api);
        const response = await t.api('POST', `/api/v1/admin/settlements/${settlementId}/pay`, { token: adminToken, body: { note: 'لا ينبغي اعتمادها' } });
        assert.equal(response.status, 409, response.text);
        assert.equal(t.app.db.get('SELECT status FROM provider_settlements WHERE id=?', settlementId)?.status, 'DUE');
        assert.equal(t.app.db.get('SELECT settlement_status FROM orders WHERE id=?', orderId)?.settlement_status, 'DUE');
    }
    finally {
        await t.close();
    }
});
test('V84.1: أرباح مقدم الخدمة التاريخية لا تتغير عند تغيير نسبة العمولة الحالية', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v841-snapshot-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم لقطة مالية' } });
        const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
        const serviceId = t.app.db.get("SELECT id FROM services WHERE slug='custom-request'")?.id;
        const now = new Date().toISOString();
        const locationId = `loc-v841-snap-${Date.now()}`;
        const orderId = `order-v841-snap-${Date.now()}`;
        t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
        t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,price_snapshot,currency,payment_method,attachments,settlement_status,commission_rate_snapshot,commission_amount,provider_payout_amount,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V841-SNAP-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'COMPLETED', 'NORMAL', 'اختبار لقطة العمولة', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 10000, 'YER', 'CASH', '[]', 'DUE', 5, 500, 9500, now, now, now);
        t.app.settings.set('platform.commission_percent', 10);
        const earnings = t.app.providers.earnings(providerId);
        assert.equal(earnings.gross, 10000);
        assert.equal(earnings.commission, 500);
        assert.equal(earnings.net, 9500);
        assert.equal(earnings.byMonth[0].commission, 500);
        assert.equal(earnings.byMonth[0].net, 9500);
    }
    finally {
        await t.close();
    }
});
test('V84.2: لا تُعتمد تسوية بأرقام لا تتطابق مع سعر الطلب ومعادلة العمولة', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v842-amount-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم تسوية غير متطابقة' } });
        const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
        const serviceId = t.app.db.get("SELECT id FROM services WHERE slug='custom-request'")?.id;
        const now = new Date().toISOString();
        const locationId = `loc-v842-${Date.now()}`;
        const orderId = `order-v842-${Date.now()}`;
        const settlementId = `settlement-v842-${Date.now()}`;
        t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
        t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,price_snapshot,currency,payment_method,attachments,settlement_status,commission_rate_snapshot,commission_amount,provider_payout_amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V842-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'COMPLETED', 'NORMAL', 'اختبار اتساق المبالغ', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 10000, 'YER', 'CASH', '[]', 'DUE', 10, 1000, 9000, now, now);
        // العمولة صحيحة، لكن صافي مقدم الخدمة غير صحيح ولا يساوي الإجمالي ناقص العمولة.
        t.app.db.run(`INSERT INTO provider_settlements(id,order_id,provider_id,gross_amount,commission_rate,commission_amount,payout_amount,currency,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, settlementId, orderId, providerId, 10000, 10, 1000, 8500, 'YER', 'DUE', now, now, now);
        const adminToken = await loginAdmin(t.api);
        const response = await t.api('POST', `/api/v1/admin/settlements/${settlementId}/pay`, { token: adminToken, body: { note: 'يجب رفض مبالغ غير متطابقة' } });
        assert.equal(response.status, 409, response.text);
        assert.match(response.text, /SETTLEMENT_AMOUNT_MISMATCH/);
        assert.equal(t.app.db.get('SELECT status FROM provider_settlements WHERE id=?', settlementId)?.status, 'DUE');
        assert.equal(t.app.db.get('SELECT settlement_status FROM orders WHERE id=?', orderId)?.settlement_status, 'DUE');
        assert.equal(t.app.db.get('SELECT paid_at FROM provider_settlements WHERE id=?', settlementId)?.paid_at, null);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v84_0_settlement_atomicity.test.js.map