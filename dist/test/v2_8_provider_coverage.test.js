import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';
test('provider area selection restricts nearby results and assignments even when service has no area rule', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const makeArea = async (name, lat, lng) => {
            const r = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: name }, type: 'CITY', centerLat: lat, centerLng: lng, radiusKm: 25 } });
            assert.equal(r.status, 201, r.text);
            return r.body.area.id;
        };
        const cityA = await makeArea('مدينة تغطية أ', 12.79, 45.02);
        const cityB = await makeArea('مدينة خارج التغطية ب', 15.35, 44.20);
        const categories = (await t.api('GET', '/api/v1/categories')).body.categories;
        const service = categories.flatMap((x) => x.services || []).find((x) => x.slug === 'air-conditioning');
        assert.ok(service);
        const provider = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: 'مقدم خدمة نطاقه محدد' } });
        assert.equal(provider.status, 201, provider.text);
        const providerToken = provider.body.accessToken;
        const me = await t.api('GET', '/api/v1/auth/me', { token: providerToken });
        const providerId = me.body.provider.id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',verified_at=?,base_lat=?,base_lng=? WHERE id=?", new Date().toISOString(), 12.79, 45.02, providerId);
        assert.equal((await t.api('PUT', '/api/v1/provider/services', { token: providerToken, body: { services: [{ serviceId: service.id, experienceYears: 1 }] } })).status, 200);
        assert.equal((await t.api('PUT', '/api/v1/provider/areas', { token: providerToken, body: { areaIds: [cityA] } })).status, 200);
        assert.equal((await t.api('POST', '/api/v1/provider/online', { token: providerToken, body: { online: true } })).status, 200);
        const customer = await registerUser(t.api);
        const outside = await t.api('GET', `/api/v1/providers/nearby?serviceId=${encodeURIComponent(service.id)}&lat=15.35&lng=44.20`, { token: customer.body.accessToken });
        assert.equal(outside.status, 200, outside.text);
        assert.ok(!outside.body.providers.some((x) => x.id === providerId), 'provider covering city A must not appear for city B');
        const outsideOrder = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: 'أحتاج خدمة في مدينة خارج نطاق مقدم الخدمة', contactPhone: customer.creds.phone, areaId: cityB, location: { lat: 15.35, lng: 44.20, source: 'gps' } } });
        assert.equal(outsideOrder.status, 201, outsideOrder.text);
        const outsideOffers = (await t.api('GET', '/api/v1/provider/offers', { token: providerToken })).body.offers || [];
        assert.ok(!outsideOffers.some((x) => x.orderId === outsideOrder.body.order.id), 'out-of-coverage order must not be offered to the provider');
        const insideOrder = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: 'أحتاج خدمة داخل نطاق مقدم الخدمة', contactPhone: customer.creds.phone, areaId: cityA, location: { lat: 12.79, lng: 45.02, source: 'gps' } } });
        assert.equal(insideOrder.status, 201, insideOrder.text);
        const insideOffers = (await t.api('GET', '/api/v1/provider/offers', { token: providerToken })).body.offers || [];
        assert.ok(insideOffers.some((x) => x.orderId === insideOrder.body.order.id), 'in-coverage order should still be offered');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_8_provider_coverage.test.js.map