import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser, loginAdmin } from './helpers.js';

test('V84.4: تدقيق التسويات يكشف اختلاف صافي مقدم الخدمة دون تعديل السجلات', async () => {
  const t = await startApp();
  try {
    const customer = await registerUser(t.api);
    const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v843-audit-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم فحص' } });
    const providerId = t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
    const serviceId = t.app.db.get<any>("SELECT id FROM services WHERE slug='custom-request'")?.id;
    const now = new Date().toISOString();
    const locationId = `loc-v843-${Date.now()}`;
    const orderId = `order-v843-${Date.now()}`;
    const settlementId = `settlement-v843-${Date.now()}`;
    t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
    t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,price_snapshot,currency,payment_method,attachments,settlement_status,commission_rate_snapshot,commission_amount,provider_payout_amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V843-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'COMPLETED', 'NORMAL', 'اختبار المصالحة المالية', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 10000, 'YER', 'CASH', '[]', 'DUE', 10, 1000, 9000, now, now);
    t.app.db.run(`INSERT INTO provider_settlements(id,order_id,provider_id,gross_amount,commission_rate,commission_amount,payout_amount,currency,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, settlementId, orderId, providerId, 10000, 10, 1000, 8500, 'YER', 'DUE', now, now, now);
    const adminToken = await loginAdmin(t.api);
    const response = await t.api('GET', '/api/v1/admin/settlements/reconciliation', { token: adminToken });
    assert.equal(response.status, 200, response.text);
    assert.ok(response.body.issues.some((x: any) => x.settlementId === settlementId && x.code === 'PAYOUT_MISMATCH'));
    assert.equal(t.app.db.get<any>('SELECT status FROM provider_settlements WHERE id=?', settlementId)?.status, 'DUE');
    assert.equal(t.app.db.get<any>('SELECT settlement_status FROM orders WHERE id=?', orderId)?.settlement_status, 'DUE');
  } finally { await t.close(); }
});

test('V84.4: تدقيق التسويات يكتشف طلبًا مكتملًا باستحقاق دون سجل تسوية', async () => {
  const t = await startApp();
  try {
    const customer = await registerUser(t.api);
    const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v843-missing-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم بلا تسوية' } });
    const providerId = t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
    const serviceId = t.app.db.get<any>("SELECT id FROM services WHERE slug='custom-request'")?.id;
    const now = new Date().toISOString();
    const locationId = `loc-v843-missing-${Date.now()}`;
    const orderId = `order-v843-missing-${Date.now()}`;
    t.app.db.run('INSERT INTO locations(id,lat,lng,accuracy_m,area_id,source,created_at) VALUES(?,?,?,?,?,?,?)', locationId, 13.97, 44.17, 10, 'system-yemen', 'gps', now);
    t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,agreed_price,price_snapshot,currency,payment_method,attachments,settlement_status,commission_amount,provider_payout_amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, orderId, `KH-V843-MISSING-${Date.now()}`, customer.body.user.id, serviceId, providerId, 'COMPLETED', 'NORMAL', 'طلب بلا سجل تسوية', '{}', locationId, 'system-yemen', customer.creds.phone, 'FIXED', 10000, 10000, 'YER', 'CASH', '[]', 'DUE', 1000, 9000, now, now);
    const adminToken = await loginAdmin(t.api);
    const response = await t.api('GET', '/api/v1/admin/settlements/reconciliation', { token: adminToken });
    assert.equal(response.status, 200, response.text);
    assert.ok(response.body.issues.some((x: any) => x.orderId === orderId && x.code === 'SETTLEMENT_MISSING'));
  } finally { await t.close(); }
});

test('V84.4: واجهات PWA تستخدم إصدار الأصول الجديد', () => {
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.2'), file);
  assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-2'));
});
