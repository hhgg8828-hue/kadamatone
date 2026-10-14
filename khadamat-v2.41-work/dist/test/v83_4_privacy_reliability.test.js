import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
test('V83.4: مقدم الخدمة غير المتصل بلا مشوار نشط لا يستطيع تحديث موقعه الحي', async () => {
    const p = await registerUser(t.api, { role: 'PROVIDER', email: `v834-location-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'اختبار الخصوصية' } });
    const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id)?.id;
    assert.ok(pid);
    const r = await t.api('POST', '/api/v1/provider/live-location', { token: p.body.accessToken, body: { lat: 13.9759, lng: 44.1709, accuracy: 10 } });
    assert.equal(r.status, 422, r.text);
    assert.equal(t.app.db.get('SELECT 1 FROM provider_live_locations WHERE provider_id=?', pid), undefined);
    assert.equal(t.app.db.get('SELECT 1 FROM trip_location_history WHERE provider_id=?', pid), undefined);
});
test('V83.4: موقع العميل ورقم التواصل لا يُكشفان لمقدم خدمة غير مسند إليه الطلب', async () => {
    const c = await registerUser(t.api);
    const p = await registerUser(t.api, { role: 'PROVIDER', email: `v834-provider-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم غير مسند' } });
    const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
    const svc = cats.flatMap((x) => x.services || []).find((x) => x.slug === 'air-conditioning') || cats.flatMap((x) => x.services || []).find((x) => x.slug !== 'motorcycle-trips');
    const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'طلب للتحقق من إخفاء بيانات التواصل', contactPhone: c.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: {} } });
    assert.equal(order.status, 201, order.text);
    const detail = await t.api('GET', `/api/v1/orders/${order.body.order.id}`, { token: p.body.accessToken });
    assert.equal(detail.status, 404, detail.text);
});
//# sourceMappingURL=v83_4_privacy_reliability.test.js.map