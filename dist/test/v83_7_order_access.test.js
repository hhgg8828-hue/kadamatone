import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
test('V83.7: مقدم الخدمة الذي رُفض عرضه لا يستطيع فتح تفاصيل الطلب لاحقًا', async () => {
    const c = await registerUser(t.api);
    const p = await registerUser(t.api, { role: 'PROVIDER', email: `v837-rejected-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم مرفوض' } });
    const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
    const svc = cats.flatMap((x) => x.services || []).find((x) => x.slug !== 'motorcycle-trips');
    assert.ok(svc, 'service fixture exists');
    const created = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'طلب لاختبار صلاحيات مقدم الخدمة', contactPhone: c.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 } } });
    assert.equal(created.status, 201, created.text);
    const orderId = created.body.order.id;
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id)?.id;
    assert.ok(providerId);
    const now = new Date().toISOString();
    t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at,responded_at) VALUES(?,?,?,'REJECTED',1,?,?,?)", `test-${Date.now()}`, orderId, providerId, now, new Date(Date.now() + 60000).toISOString(), now);
    for (const path of [`/api/v1/orders/${orderId}`, `/api/v1/orders/${orderId}/tasks`, `/api/v1/orders/${orderId}/timeline`]) {
        const response = await t.api('GET', path, { token: p.body.accessToken });
        assert.equal(response.status, 404, `${path}: ${response.text}`);
    }
});
test('V83.7: مقدم الخدمة الذي ما زال لديه عرض قائم يستطيع الوصول إلى الطلب المعروض له', async () => {
    const c = await registerUser(t.api);
    const p = await registerUser(t.api, { role: 'PROVIDER', email: `v837-offered-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم عرض قائم' } });
    const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
    const svc = cats.flatMap((x) => x.services || []).find((x) => x.slug !== 'motorcycle-trips');
    const created = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'طلب لاختبار العرض القائم', contactPhone: c.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 } } });
    assert.equal(created.status, 201, created.text);
    const orderId = created.body.order.id;
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id)?.id;
    const now = new Date().toISOString();
    t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", `test-${Date.now()}`, orderId, providerId, now, new Date(Date.now() + 60000).toISOString());
    const response = await t.api('GET', `/api/v1/orders/${orderId}`, { token: p.body.accessToken });
    assert.equal(response.status, 200, response.text);
    const task = await t.api('POST', `/api/v1/orders/${orderId}/tasks`, { token: c.body.accessToken, body: { tasks: [{ title: 'مهمة تجريبية' }] } });
    assert.equal(task.status, 200, task.text);
    const mutation = await t.api('PATCH', `/api/v1/orders/${orderId}/tasks/${task.body.tasks[0].id}`, { token: p.body.accessToken, body: { status: 'IN_PROGRESS' } });
    assert.equal(mutation.status, 403, mutation.text);
});
test('V83.7: كل واجهات PWA تستخدم أصول الإصدار الجديد', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.36'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-36'));
});
//# sourceMappingURL=v83_7_order_access.test.js.map