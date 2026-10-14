import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
async function acceptedTrip() {
    const customer = await registerUser(t.api);
    const created = await t.api('POST', '/api/v1/trips', { token: customer.body.accessToken, headers: { 'Idempotency-Key': `v847-trip-${Date.now()}-${Math.random()}` }, body: {
            origin: { lat: 15.36, lng: 44.19 }, purpose: 'PASSENGER', description: 'اختبار احتساب وقت انتظار المشوار', contactPhone: customer.creds.phone,
        } });
    assert.equal(created.status, 201, created.text);
    const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v847-provider-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم مشوار انتظار' } });
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
    const serviceId = t.app.db.get('SELECT service_id FROM orders WHERE id=?', created.body.order.id)?.service_id;
    const now = new Date(t.app.clock.now()).toISOString();
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',verified_at=?,is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", now, providerId);
    t.app.db.run('INSERT OR IGNORE INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,1,1)', providerId, serviceId);
    t.app.db.run('INSERT INTO provider_vehicles(id,provider_id,vehicle_type,status,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', `v847-vehicle-${Date.now()}`, providerId, 'MOTORCYCLE', 'VERIFIED', 1, now, now);
    const offerId = `v847-offer-${Date.now()}`;
    t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", offerId, created.body.order.id, providerId, now, new Date(t.app.clock.now() + 120_000).toISOString());
    const accepted = await t.api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.body.accessToken, body: {} });
    assert.equal(accepted.status, 200, accepted.text);
    t.app.db.run("UPDATE orders SET status='IN_PROGRESS',started_at=?,updated_at=?,version=version+1 WHERE id=?", now, now, created.body.order.id);
    return { customer, provider, providerId, orderId: created.body.order.id };
}
test('V84.7: إيقاف الانتظار يحدّث أجرة الطلب وسجل الدفع النقدي ضمن معاملة واحدة', async () => {
    const f = await acceptedTrip();
    const before = t.app.db.get('SELECT amount,status FROM payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1', f.orderId);
    assert.equal(before.status, 'PENDING');
    const start = await t.api('POST', `/api/v1/trips/${f.orderId}/wait`, { token: f.provider.body.accessToken, body: { action: 'START' } });
    assert.equal(start.status, 200, start.text);
    const realNow = t.app.clock.now;
    t.app.clock.now = () => realNow() + 5 * 60_000;
    try {
        const stop = await t.api('POST', `/api/v1/trips/${f.orderId}/wait`, { token: f.provider.body.accessToken, body: { action: 'STOP' } });
        assert.equal(stop.status, 200, stop.text);
        assert.equal(stop.body.totalMinutes, 5);
        const trip = t.app.db.get('SELECT fare,waiting_total_minutes,currency FROM trip_orders WHERE order_id=?', f.orderId);
        const order = t.app.db.get('SELECT agreed_price,price_snapshot FROM orders WHERE id=?', f.orderId);
        const payment = t.app.db.get('SELECT amount,status FROM payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1', f.orderId);
        assert.equal(order.agreed_price, trip.fare);
        assert.equal(order.price_snapshot, trip.fare);
        assert.equal(payment.amount, trip.fare);
        assert.equal(payment.status, 'PENDING');
        assert.equal(trip.waiting_total_minutes, 5);
    }
    finally {
        t.app.clock.now = realNow;
    }
});
test('V84.7: يمنع بدء جلستي انتظار متزامنتين للمشوار نفسه', async () => {
    const f = await acceptedTrip();
    const first = await t.api('POST', `/api/v1/trips/${f.orderId}/wait`, { token: f.provider.body.accessToken, body: { action: 'START' } });
    assert.equal(first.status, 200, first.text);
    const second = await t.api('POST', `/api/v1/trips/${f.orderId}/wait`, { token: f.provider.body.accessToken, body: { action: 'START' } });
    assert.equal(second.status, 409, second.text);
    assert.equal(second.body.error?.code, 'WAIT_ALREADY_STARTED');
    assert.equal(t.app.db.get("SELECT COUNT(*) n FROM trip_wait_sessions WHERE order_id=? AND ended_at IS NULL", f.orderId).n, 1);
});
//# sourceMappingURL=v84_7_trip_wait_fare_atomicity.test.js.map