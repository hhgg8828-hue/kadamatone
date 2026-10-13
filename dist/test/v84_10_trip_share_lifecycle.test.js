import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
async function makeAssignedOrder(t) {
    const customer = await registerUser(t.api);
    const provider = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم مشاركة اختبار' } });
    const categories = await t.api('GET', '/api/v1/categories');
    const service = categories.body.categories.flatMap((x) => x.services || []).find((x) => x.slug !== 'motorcycle-trips');
    assert.ok(service);
    const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: {
            serviceId: service.id, description: 'اختبار دورة حياة رابط مشاركة المشوار', contactPhone: customer.creds.phone,
            location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 }
        } });
    assert.equal(created.status, 201, created.text);
    const orderId = created.body.order.id;
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
    assert.ok(providerId);
    t.app.db.run("UPDATE orders SET provider_id=?,status='IN_PROGRESS',version=version+1 WHERE id=?", providerId, orderId);
    return { customer, provider, orderId };
}
test('V84.10: public trip share works during execution but is blocked after completion', async () => {
    const t = await startApp();
    try {
        const f = await makeAssignedOrder(t);
        const shared = await t.api('POST', `/api/v1/orders/${f.orderId}/share`, { token: f.customer.body.accessToken });
        assert.equal(shared.status, 200, shared.text);
        const token = new URL(shared.body.url, 'http://localhost').searchParams.get('token');
        assert.ok(token);
        assert.equal((await t.api('GET', `/api/v1/shared-trips/${token}`)).status, 200);
        assert.equal((await t.api('GET', `/api/v1/shared-trips/${token}/route`)).status, 200);
        const now = new Date().toISOString();
        t.app.db.run("UPDATE orders SET status='COMPLETED',completed_at=?,updated_at=?,version=version+1 WHERE id=?", now, now, f.orderId);
        const details = await t.api('GET', `/api/v1/shared-trips/${token}`);
        const route = await t.api('GET', `/api/v1/shared-trips/${token}/route`);
        assert.equal(details.status, 404, details.text);
        assert.equal(route.status, 404, route.text);
    }
    finally {
        await t.close();
    }
});
test('V84.10: cannot create a new public trip share after order is terminal', async () => {
    const t = await startApp();
    try {
        const f = await makeAssignedOrder(t);
        const now = new Date().toISOString();
        t.app.db.run("UPDATE orders SET status='CANCELLED',cancelled_at=?,updated_at=?,version=version+1 WHERE id=?", now, now, f.orderId);
        const shared = await t.api('POST', `/api/v1/orders/${f.orderId}/share`, { token: f.customer.body.accessToken });
        assert.equal(shared.status, 422, shared.text);
        assert.equal(shared.body.error?.code, 'TRIP_SHARE_INACTIVE');
    }
    finally {
        await t.close();
    }
});
test('V84.10: revocation is permanent across later status changes and cannot reactivate an old share token', async () => {
    const t = await startApp();
    try {
        const f = await makeAssignedOrder(t);
        const shared = await t.api('POST', `/api/v1/orders/${f.orderId}/share`, { token: f.customer.body.accessToken });
        assert.equal(shared.status, 200, shared.text);
        const token = new URL(shared.body.url, 'http://localhost').searchParams.get('token');
        assert.ok(token);
        const cancelled = await t.api('POST', `/api/v1/orders/${f.orderId}/cancel`, { token: f.customer.body.accessToken, body: { reason: 'اختبار إبطال رابط المشاركة' } });
        assert.equal(cancelled.status, 200, cancelled.text);
        assert.ok(t.app.db.get('SELECT revoked_at FROM trip_shares WHERE order_id=?', f.orderId)?.revoked_at);
        // Simulate a later administrative/state repair: the previous bearer token must stay dead.
        const now = new Date().toISOString();
        t.app.db.run("UPDATE orders SET status='ACCEPTED',updated_at=?,version=version+1 WHERE id=?", now, f.orderId);
        assert.equal((await t.api('GET', `/api/v1/shared-trips/${token}`)).status, 404);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v84_10_trip_share_lifecycle.test.js.map