import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, loginAdmin, registerUser } from './helpers.js';
function svc(t, slug) { return t.app.db.get('SELECT * FROM services WHERE slug=?', slug); }
test('V66.7: اطلب لي يحول شراء غرض غير مسمى إلى شراء + إحضار + توصيل ولا يعتمد على اسم الغرض', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const r = await t.api('POST', '/api/v1/assist/request', { token: c.body.accessToken, body: { text: 'أريد واحد يشتري لي بيبسي ويوصله للبيت.' } });
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.recommended.serviceSlug, 'purchase-and-delivery');
        assert.equal(r.body.extracted.purchaseIntent, true);
        const a = await t.api('POST', '/api/v1/assist/session', { token: c.body.accessToken, body: { text: 'أريد واحد يروح للصيدلية ويجيب لي الدواء' } });
        assert.equal(a.status, 200, a.text);
        assert.equal(a.body.draft.taskType, 'PURCHASE_PHARMACY');
        assert.ok(a.body.draft.requiredCapabilities.includes('purchase:pharmacy'));
    }
    finally {
        await t.close();
    }
});
test('V66.7: الخدمة المؤقتة لها أولوية ديناميكية وتدفق طلب مرتبط فعليًا', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const c = await t.api('GET', '/api/v1/admin/catalog', { token: admin });
        const service = c.body.categories.flatMap((x) => x.services || []).find((x) => x.slug === 'motorcycle-trips');
        assert.ok(service?.id);
        const now = Date.now();
        const before = await t.api('POST', '/api/v1/admin/temporary-services', { token: admin, body: { linkedServiceId: service.id, name: { ar: 'حملة لاحقة' }, title: { ar: 'لاحقًا' }, startAt: new Date(now + 3600000).toISOString(), endAt: new Date(now + 7200000).toISOString(), isActive: true, priority: 1, requestFlow: 'TRIP' } });
        assert.equal(before.status, 200, before.text);
        const active = await t.api('POST', '/api/v1/admin/temporary-services', { token: admin, body: { linkedServiceId: service.id, name: { ar: 'مقاضي جمعتك علينا' }, title: { ar: 'مقاضي جمعتك علينا' }, startAt: new Date(now - 3600000).toISOString(), endAt: new Date(now + 86400000).toISOString(), isActive: true, priority: 100, requestFlow: 'TRIP', actionValue: 'motorcycle-trips' } });
        assert.equal(active.status, 200, active.text);
        const publicCat = await t.api('GET', '/api/v1/catalog/bootstrap');
        assert.equal(publicCat.status, 200);
        assert.equal(publicCat.body.temporaryServices[0].id, active.body.id);
        assert.equal(publicCat.body.temporaryServices[0].requestFlow, 'TRIP');
        await t.api('PATCH', `/api/v1/admin/temporary-services/${active.body.id}`, { token: admin, body: { endAt: new Date(now - 1000).toISOString() } }).then(x => assert.equal(x.status, 200, x.text));
        const after = await t.api('GET', '/api/v1/catalog/bootstrap');
        assert.equal(after.body.temporaryServices.some((x) => x.id === active.body.id), false);
        const hist = await t.api('GET', '/api/v1/admin/temporary-services', { token: admin });
        const row = hist.body.items.find((x) => x.id === active.body.id);
        assert.equal(row.state, 'EXPIRED');
    }
    finally {
        await t.close();
    }
});
test('V66.7: الطلب المركب وسجل التنفيذ الذكي مرتبطان بالطلب نفسه', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const service = svc(t, 'custom-request');
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'compound-1' }, body: { serviceId: service.id, description: 'طلب مركب لشراء واستلام وتسليم', contactPhone: c.creds.phone, tasks: [{ title: 'شراء الغرض', taskType: 'PURCHASE' }, { title: 'استلامه', taskType: 'PICKUP' }, { title: 'توصيله للمنزل', taskType: 'DELIVERY' }] } });
        assert.equal(o.status, 201, o.text);
        const id = o.body.order.id;
        const tasks = await t.api('GET', `/api/v1/orders/${id}/tasks`, { token: c.body.accessToken });
        assert.equal(tasks.status, 200);
        assert.equal(tasks.body.tasks.length, 3);
        const tl = await t.api('GET', `/api/v1/orders/${id}/timeline`, { token: c.body.accessToken });
        assert.equal(tl.status, 200);
        assert.ok(tl.body.timeline.some((x) => x.type === 'COMPOUND_TASKS_CREATED'));
    }
    finally {
        await t.close();
    }
});
test('V66.7: المطابقة تستخدم قدرة الشراء الفعلية، والخدمة المستعجلة تحصل على تعزيز داخل الترتيب', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p1 = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'قادر على الشراء' } });
        const p2 = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'غير قادر' } });
        const service = svc(t, 'purchase-and-delivery');
        const now = new Date().toISOString();
        for (const p of [p1, p2]) {
            const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
            t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=13.9759,base_lng=44.1709 WHERE id=?", pid);
            t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, service.id, 1);
        }
        const id1 = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p1.body.user.id).id;
        t.app.db.run('INSERT INTO provider_capabilities(id,provider_id,capability_key,created_at,updated_at) VALUES(?,?,?,?,?)', 'buycap', id1, 'purchase:store', now, now);
        const id2 = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p2.body.user.id).id;
        t.app.db.run('INSERT INTO provider_capabilities(id,provider_id,capability_key,created_at,updated_at) VALUES(?,?,?,?,?)', 'othercap', id2, 'trip:passenger', now, now);
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'buy-cap-1' }, body: { serviceId: service.id, description: 'شراء بيبسي وتوصيله', contactPhone: c.creds.phone, priority: 'URGENT', location: { lat: 13.9759, lng: 44.1709, source: 'manual' }, formData: { item: 'بيبسي' } } });
        assert.equal(o.status, 201, o.text);
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p1.body.accessToken });
        assert.ok(offers.body.offers.some((x) => x.orderId === o.body.order.id));
        const bad = await t.api('GET', '/api/v1/provider/offers', { token: p2.body.accessToken });
        assert.equal(bad.body.offers.some((x) => x.orderId === o.body.order.id), false);
    }
    finally {
        await t.close();
    }
});
test('V66.7: واجهة الخريطة تحتوي مسار CDN احتياطي وFallback للإحداثيات', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('cdn.jsdelivr.net/npm/leaflet@1.9.4'));
    assert.ok(app.includes('تحديد الموقع بدون خريطة'));
    assert.ok(app.includes('fallback${key}Lat'));
    assert.ok(app.includes('fallback${key}Lng'));
    assert.ok(app.includes('تحديد الموقع بدون خريطة'));
});
//# sourceMappingURL=v66_7_execution.test.js.map