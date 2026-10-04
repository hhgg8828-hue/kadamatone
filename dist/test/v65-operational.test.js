import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';
const findService = (t, slug) => t.app.catalog.all().services.find((x) => x.slug === slug);
async function readyProvider(t, svc, name = 'مزود V65') {
    const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: name } });
    const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?", 13.9759, 44.1709, pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 2);
    return { p, pid };
}
test('V65: إشعار اشتراك المتصفح يُحفظ ويُحدّث دون تكرار', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const body = { endpoint: 'https://push.example.test/sub/123', p256dh: 'key1', auth: 'auth1', platform: 'WEB' };
        const a = await t.api('POST', '/api/v1/notifications/subscriptions', { token: c.body.accessToken, body });
        assert.equal(a.status, 200, a.text);
        const b = await t.api('POST', '/api/v1/notifications/subscriptions', { token: c.body.accessToken, body: { ...body, p256dh: 'key2' } });
        assert.equal(b.status, 200, b.text);
        const row = t.app.db.get('SELECT * FROM notification_subscriptions WHERE user_id=? AND endpoint=?', c.body.user.id, body.endpoint);
        assert.equal(row.p256dh, 'key2');
        assert.equal(t.app.db.all('SELECT * FROM notification_subscriptions WHERE user_id=?', c.body.user.id).length, 1);
        const del = await t.api('DELETE', '/api/v1/notifications/subscriptions?endpoint=' + encodeURIComponent(body.endpoint), { token: c.body.accessToken });
        assert.equal(del.status, 200);
        assert.equal(t.app.db.get('SELECT 1 FROM notification_subscriptions WHERE user_id=? AND endpoint=?', c.body.user.id, body.endpoint), undefined);
    }
    finally {
        await t.close();
    }
});
test('V65: طلب اشتر لي العادي يدعم تعديل الشراء وموافقة العميل', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const svc = findService(t, 'purchase-and-delivery');
        const { p } = await readyProvider(t, svc);
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'اشتر لي غرض من السوق', location: { lat: 13.9759, lng: 44.1709 }, contactPhone: c.creds.phone, formData: { item: 'أسطوانة غاز', quantity: 1, max_price: 5000 } } });
        assert.equal(order.status, 201, order.text);
        const id = order.body.order.id;
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        assert.ok(offers.body.offers.length);
        assert.equal((await t.api('POST', `/api/v1/provider/offers/${offers.body.offers[0].id}/accept`, { token: p.body.accessToken, body: {} })).status, 200);
        const change = await t.api('POST', `/api/v1/provider/orders/${id}/purchase-change`, { token: p.body.accessToken, body: { requestedPrice: 6200, requestedProduct: 'أسطوانة غاز نوع بديل', reason: 'السعر المتاح أعلى من الحد الأصلي' } });
        assert.equal(change.status, 200, change.text);
        const duplicate = await t.api('POST', `/api/v1/provider/orders/${id}/purchase-change`, { token: p.body.accessToken, body: { requestedPrice: 6500 } });
        assert.equal(duplicate.status, 409);
        const approve = await t.api('POST', `/api/v1/orders/${id}/purchase-change/${change.body.change.id}/respond`, { token: c.body.accessToken, body: { decision: 'APPROVE' } });
        assert.equal(approve.status, 200, approve.text);
        const row = t.app.db.get('SELECT agreed_price FROM orders WHERE id=?', id);
        assert.equal(Number(row.agreed_price), 6200);
    }
    finally {
        await t.close();
    }
});
test('V65: إثبات التسليم بتأكيد المستلم يمنع الإكمال قبل التأكيد', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const svc = findService(t, 'document-delivery');
        t.app.db.run("UPDATE services SET delivery_proof_type='RECIPIENT_CONFIRMATION' WHERE id=?", svc.id);
        const { p } = await readyProvider(t, svc, 'مزود إثبات المستلم');
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'توصيل مستند مع تأكيد المستلم', location: { lat: 13.9759, lng: 44.1709 }, contactPhone: c.creds.phone } });
        const id = order.body.order.id;
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        await t.api('POST', `/api/v1/provider/offers/${offers.body.offers[0].id}/accept`, { token: p.body.accessToken, body: {} });
        await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'ON_THE_WAY' } });
        await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'IN_PROGRESS' } });
        const blocked = await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'COMPLETED' } });
        assert.equal(blocked.status, 422);
        const confirm = await t.api('POST', `/api/v1/orders/${id}/delivery-proof/recipient-confirm`, { token: c.body.accessToken, body: { recipientName: 'محمد أحمد' } });
        assert.equal(confirm.status, 200, confirm.text);
        const done = await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'COMPLETED' } });
        assert.equal(done.status, 200, done.text);
    }
    finally {
        await t.close();
    }
});
test('V65: المطابقة تستخدم الموقع الحي وتفضيل العميل والخبرة ضمن الدرجة', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const svc = findService(t, 'document-delivery');
        const a = await readyProvider(t, svc, 'مزود قريب');
        const b = await readyProvider(t, svc, 'مزود آخر');
        t.app.db.run('UPDATE service_providers SET base_lat=?,base_lng=?,rating_avg=?,rating_count=? WHERE id=?', 13.9759, 44.1709, 5, 10, a.pid);
        t.app.db.run('UPDATE service_providers SET base_lat=?,base_lng=?,rating_avg=?,rating_count=? WHERE id=?', 13.9759, 44.1715, 5, 10, b.pid);
        t.app.db.run('INSERT OR IGNORE INTO favorite_providers(customer_id,provider_id,created_at) VALUES(?,?,?)', c.body.user.id, b.pid, new Date().toISOString());
        t.app.db.run('INSERT INTO provider_live_locations(provider_id,lat,lng,updated_at) VALUES(?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at', a.pid, 13.9759, 44.1800, new Date().toISOString());
        const candidates = t.app.matcher.findCandidates(t.app.db.get('SELECT * FROM orders WHERE id=?', 'missing') || { service_id: svc.id, customer_id: c.body.user.id, location_id: 'no-location', location_provided: 0, area_id: 'system-yemen', scheduled_at: null }, { excludeProviderIds: [], limit: 2 });
        assert.equal(candidates.length, 2);
        assert.equal(candidates[0].providerId, b.pid);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v65-operational.test.js.map