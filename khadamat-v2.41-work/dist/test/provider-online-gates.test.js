import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
let t, api;
before(async () => { t = await startApp(); api = t.api; });
after(async () => { await t.close(); });
describe('جاهزية استقبال الطلبات لمقدم الخدمة', () => {
    test('لا يبدأ الاستقبال قبل وجود التوثيق والموقع والخدمة', async () => {
        const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم اختبار' } });
        assert.equal(p.status, 201, JSON.stringify(p.body));
        const token = p.body.accessToken;
        const me = await api('GET', '/api/v1/auth/me', { token });
        const providerId = me.body.provider.id;
        let unverified = await api('POST', '/api/v1/provider/online', { token, body: { online: true } });
        assert.equal(unverified.status, 403);
        assert.equal(unverified.body.error.code, 'PROVIDER_NOT_VERIFIED');
        assert.equal(unverified.body.error.message, 'لا يمكنك استقبال الطلبات قبل توثيق حسابك');
        t.app.db.run(`UPDATE service_providers SET verification_status='VERIFIED', verified_at=? WHERE id=?`, new Date().toISOString(), providerId);
        let r = await api('POST', '/api/v1/provider/online', { token, body: { online: true } });
        assert.equal(r.status, 422);
        assert.equal(r.body.error.code, 'PROVIDER_LOCATION_REQUIRED');
        await api('PATCH', '/api/v1/provider/profile', { token, body: { baseLocation: { lat: 13.5795, lng: 44.0209 } } });
        r = await api('POST', '/api/v1/provider/online', { token, body: { online: true } });
        assert.equal(r.status, 422);
        assert.equal(r.body.error.code, 'PROVIDER_SERVICES_REQUIRED');
        const cats = (await api('GET', '/api/v1/categories')).body.categories;
        const serviceId = cats.flatMap((c) => c.services || [])[0].id;
        r = await api('PUT', '/api/v1/provider/services', { token, body: { services: [{ serviceId, experienceYears: 1 }] } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        r = await api('POST', '/api/v1/provider/online', { token, body: { online: true } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.isOnline, true);
    });
});
//# sourceMappingURL=provider-online-gates.test.js.map