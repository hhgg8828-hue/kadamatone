import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
async function createDestinationPendingTrip() {
    const customer = await registerUser(t.api);
    const result = await t.api('POST', '/api/v1/trips', { token: customer.body.accessToken, headers: { 'Idempotency-Key': `v846-trip-${Date.now()}-${Math.random()}` }, body: {
            origin: { lat: 15.36, lng: 44.19 }, purpose: 'PASSENGER', description: 'اختبار سلامة تحديد وجهة المشوار', contactPhone: customer.creds.phone
        } });
    assert.equal(result.status, 201, result.text);
    assert.equal(result.body.trip.destinationPending, true);
    return { customer, orderId: result.body.order.id };
}
test('V84.6: الوجهة تُحدد مرة واحدة ولا يتغير السعر بصمت بإعادة إرسال وجهة أخرى', async () => {
    const f = await createDestinationPendingTrip();
    const first = await t.api('POST', `/api/v1/trips/${f.orderId}/destination`, { token: f.customer.body.accessToken, body: { destination: { lat: 15.37, lng: 44.20 } } });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.body.trip.destinationPending, false);
    const fare = t.app.db.get('SELECT fare FROM trip_orders WHERE order_id=?', f.orderId).fare;
    const second = await t.api('POST', `/api/v1/trips/${f.orderId}/destination`, { token: f.customer.body.accessToken, body: { destination: { lat: 15.40, lng: 44.25 } } });
    assert.equal(second.status, 409, second.text);
    assert.equal(second.body.error?.code, 'DESTINATION_ALREADY_SET');
    assert.equal(t.app.db.get('SELECT fare FROM trip_orders WHERE order_id=?', f.orderId).fare, fare);
});
test('V84.6: تحديد وجهة بعد القبول يحدّث الأجرة المتفق عليها وسجل الدفع المعلّق معًا', async () => {
    const f = await createDestinationPendingTrip();
    const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v846-provider-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: 'مقدم مشوار اختبار' } });
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
    const serviceId = t.app.db.get("SELECT service_id FROM orders WHERE id=?", f.orderId)?.service_id;
    const now = new Date().toISOString();
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',verified_at=?,is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", now, providerId);
    t.app.db.run('INSERT OR IGNORE INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,1,1)', providerId, serviceId);
    t.app.db.run('INSERT INTO provider_vehicles(id,provider_id,vehicle_type,status,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', `v846-vehicle-${Date.now()}`, providerId, 'MOTORCYCLE', 'VERIFIED', 1, now, now);
    const offerId = `v846-offer-${Date.now()}`;
    t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", offerId, f.orderId, providerId, now, new Date(Date.now() + 120_000).toISOString());
    const accepted = await t.api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.body.accessToken, body: {} });
    assert.equal(accepted.status, 200, accepted.text);
    const beforePayment = t.app.db.get('SELECT amount,status FROM payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1', f.orderId);
    assert.ok(beforePayment.amount > 0);
    assert.equal(beforePayment.status, 'PENDING');
    const destination = await t.api('POST', `/api/v1/trips/${f.orderId}/destination`, { token: f.customer.body.accessToken, body: { destination: { lat: 15.60, lng: 44.50 } } });
    assert.equal(destination.status, 200, destination.text);
    const order = t.app.db.get('SELECT agreed_price,price_snapshot FROM orders WHERE id=?', f.orderId);
    const trip = t.app.db.get('SELECT fare FROM trip_orders WHERE order_id=?', f.orderId);
    const payment = t.app.db.get('SELECT amount,status FROM payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1', f.orderId);
    assert.equal(order.agreed_price, trip.fare);
    assert.equal(order.price_snapshot, trip.fare);
    assert.equal(payment.amount, trip.fare);
    assert.ok(payment.amount > beforePayment.amount, 'the longer destination must update the agreed fare');
    assert.equal(payment.status, 'PENDING');
});
test('V84.6: لا يمكن تحديد وجهة بعد بدء التنفيذ', async () => {
    const f = await createDestinationPendingTrip();
    const now = new Date().toISOString();
    t.app.db.run("UPDATE orders SET status='IN_PROGRESS',started_at=?,updated_at=?,version=version+1 WHERE id=?", now, now, f.orderId);
    const result = await t.api('POST', `/api/v1/trips/${f.orderId}/destination`, { token: f.customer.body.accessToken, body: { destination: { lat: 15.37, lng: 44.20 } } });
    assert.equal(result.status, 422, result.text);
    assert.equal(result.body.error?.code, 'TRIP_DESTINATION_LOCKED');
    assert.equal(t.app.db.get('SELECT destination_pending FROM trip_orders WHERE order_id=?', f.orderId).destination_pending, 1);
});
//# sourceMappingURL=v84_6_trip_destination_integrity.test.js.map