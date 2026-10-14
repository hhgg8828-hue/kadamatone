import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, loginAdmin } from './helpers.js';

test('V85.1: quote separates service value and delivery fee, and accepted order stores the exact total', async () => {
  const t = await startApp();
  try {
    const api = t.api;
    const admin = await loginAdmin(api);
    const area = await api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'منطقة عرض السعر' }, type: 'CITY', centerLat: 12.79, centerLng: 45.02, radiusKm: 25 } });
    assert.equal(area.status, 201, area.text);
    const categories = (await api('GET', '/api/v1/categories')).body.categories;
    const service = categories.flatMap((x: any) => x.services || []).find((x: any) => x.slug === 'purchase-and-delivery');
    assert.ok(service, 'purchase-and-delivery service must exist');
    const provider = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم شراء وتوصيل' } });
    const providerToken = provider.body.accessToken;
    const me = await api('GET', '/api/v1/auth/me', { token: providerToken });
    const providerId = me.body.provider.id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',verified_at=?,base_lat=?,base_lng=? WHERE id=?", new Date().toISOString(), 12.79, 45.02, providerId);
    assert.equal((await api('PUT', '/api/v1/provider/services', { token: providerToken, body: { services: [{ serviceId: service.id, experienceYears: 2 }] } })).status, 200);
    assert.equal((await api('PUT', '/api/v1/provider/areas', { token: providerToken, body: { areaIds: [area.body.area.id] } })).status, 200);
    assert.equal((await api('POST', '/api/v1/provider/online', { token: providerToken, body: { online: true } })).status, 200);
    const customer = await registerUser(api);
    const created = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: 'اشتر لي غرضًا من السوق وأوصله للبيت', contactPhone: customer.body.user.phone, areaId: area.body.area.id, location: { lat: 12.79, lng: 45.02, source: 'gps' }, formData: { item: 'مستلزمات منزلية', quantity: 2, max_price: 5000 } } });
    assert.equal(created.status, 201, created.text);
    const orderId = created.body.order.id;
    const offers = (await api('GET', '/api/v1/provider/offers', { token: providerToken })).body.offers;
    assert.ok(offers.some((x: any) => x.orderId === orderId));
    const submitted = await api('POST', `/api/v1/provider/orders/${orderId}/quote`, { token: providerToken, body: { amount: 4000, deliveryFee: 300, message: 'يشمل شراء الغرض والتوصيل' } });
    assert.equal(submitted.status, 201, submitted.text);
    assert.equal(submitted.body.quote.amount, 4000);
    assert.equal(submitted.body.quote.deliveryFee, 300);
    assert.equal(submitted.body.quote.totalAmount, 4300);
    const quotes = await api('GET', `/api/v1/orders/${orderId}/quotes`, { token: customer.body.accessToken });
    assert.equal(quotes.status, 200, quotes.text);
    assert.equal(quotes.body.quotes[0].totalAmount, 4300);
    const accepted = await api('POST', `/api/v1/orders/${orderId}/quotes/${submitted.body.quote.id}/accept`, { token: customer.body.accessToken, body: {} });
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.body.order.agreedPrice, 4300);
  } finally { await t.close(); }
});
