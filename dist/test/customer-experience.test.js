import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, uniquePhone } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
describe('V60 Fixed update: customer experience', () => {
    test('عميل يسجل بدون بريد، ومقدم الخدمة يرفض بدون بريد', async () => {
        const c = await registerUser(t.api);
        assert.equal(c.status, 201);
        assert.equal(c.body.user.email, null);
        const p = await t.api('POST', '/api/v1/auth/register', { body: { fullName: 'مقدم خدمة', phone: uniquePhone(), password: 'Passw0rd123', role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'سائق اختبار' } } });
        assert.equal(p.status, 422);
        assert.equal(p.body.error.code, 'PROVIDER_EMAIL_REQUIRED');
    });
    test('اطلب لي يستخدم المطابقة الهجينة ويسجل بحث العميل', async () => {
        const c = await registerUser(t.api);
        const tok = c.body.accessToken;
        const r = await t.api('POST', '/api/v1/assist/request', { token: tok, body: { text: 'أريد واحد يصلح المكيف' } });
        assert.equal(r.status, 200);
        assert.ok(r.body.matches.length > 0);
        assert.equal(r.body.recommended.serviceSlug, 'air-conditioning');
        const h = await t.api('GET', '/api/v1/me/searches/recent', { token: tok });
        assert.equal(h.status, 200);
        assert.equal(h.body.searches[0].query, 'أريد واحد يصلح المكيف');
    });
    test('المواقع المحفوظة والمستفيدون والمفضلة معزولة لكل عميل', async () => {
        const c = await registerUser(t.api);
        const tok = c.body.accessToken;
        const a = await t.api('POST', '/api/v1/me/addresses', { token: tok, body: { label: 'البيت', location: { lat: 13.9759, lng: 44.1709, source: 'manual' } } });
        assert.ok([200, 201].includes(a.status));
        const b = await t.api('POST', '/api/v1/me/beneficiaries', { token: tok, body: { label: 'أبي', fullName: 'أبي اختبار', phone: '+967771111111' } });
        assert.ok([200, 201].includes(b.status));
        assert.equal(b.body.beneficiary.fullName, 'أبي اختبار');
        const p = await registerUser(t.api, { role: 'PROVIDER', email: `fav-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مزود مفضل' } });
        const pid = (await t.api('GET', '/api/v1/auth/me', { token: p.body.accessToken })).body.provider.id;
        assert.equal((await t.api('POST', `/api/v1/me/favorites/providers/${pid}`, { token: tok, body: {} })).status, 200);
        const f = await t.api('GET', '/api/v1/me/favorites/providers', { token: tok });
        assert.equal(f.body.providers[0].id, pid);
    });
    test('إعادة الطلب تعيد مسودة مرتبطة بالطلب السابق دون إنشاء طلب ثان', async () => {
        const c = await registerUser(t.api);
        const tok = c.body.accessToken;
        const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
        const svc = cats.flatMap((x) => x.services || []).find((x) => x.slug === 'air-conditioning');
        const o = await t.api('POST', '/api/v1/orders', { token: tok, body: { serviceId: svc.id, description: 'إصلاح مكيف للاختبار', contactPhone: c.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: {} } });
        assert.equal(o.status, 201);
        const r = await t.api('POST', `/api/v1/orders/${o.body.order.id}/reorder`, { token: tok, body: {} });
        assert.equal(r.status, 200);
        assert.equal(r.body.draft.serviceId, svc.id);
        assert.equal(r.body.draft.description, 'إصلاح مكيف للاختبار');
    });
    test('تقدير المشوار يدعم نقاط توقف ويحسب المسار المتسلسل', async () => {
        const c = await registerUser(t.api);
        const tok = c.body.accessToken;
        const r = await t.api('POST', '/api/v1/trips/estimate', { token: tok, body: { origin: { lat: 13.9759, lng: 44.1709 }, stops: [{ lat: 13.98, lng: 44.18 }], destination: { lat: 13.99, lng: 44.19 } } });
        assert.equal(r.status, 200);
        assert.ok(Number(r.body.distanceKm) > 0);
        assert.ok(['STRAIGHT_LINE_TEST', 'ROAD_ROUTING'].includes(r.body.method));
    });
});
//# sourceMappingURL=customer-experience.test.js.map