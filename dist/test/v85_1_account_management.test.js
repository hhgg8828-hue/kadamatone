import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, loginAdmin } from './helpers.js';
test('V85.1: secondary contact can be saved, normalized, cleared, and primary phone remains unchanged', async () => {
    const t = await startApp();
    try {
        const registered = await registerUser(t.api);
        const token = registered.body.accessToken;
        const originalPhone = registered.body.user.phone;
        const saved = await t.api('PATCH', '/api/v1/me/profile', { token, body: { secondaryPhone: '  +967 771 555 444  ' } });
        assert.equal(saved.status, 200, saved.text);
        assert.equal(saved.body.user.phone, originalPhone);
        assert.equal(saved.body.user.secondaryPhone, '+967771555444');
        const same = await t.api('PATCH', '/api/v1/me/profile', { token, body: { secondaryPhone: originalPhone } });
        assert.equal(same.status, 422);
        assert.equal(same.body.error.code, 'SECONDARY_PHONE_DUPLICATE');
        const cleared = await t.api('PATCH', '/api/v1/me/profile', { token, body: { secondaryPhone: '' } });
        assert.equal(cleared.status, 200, cleared.text);
        assert.equal(cleared.body.user.secondaryPhone, null);
    }
    finally {
        await t.close();
    }
});
test('V85.1: account deletion anonymizes contact data and revokes access', async () => {
    const t = await startApp();
    try {
        const registered = await registerUser(t.api);
        const token = registered.body.accessToken;
        const userId = registered.body.user.id;
        const response = await t.api('DELETE', '/api/v1/me/account', { token, body: { confirmation: 'DELETE' } });
        assert.equal(response.status, 200, response.text);
        assert.equal(response.body.deleted, true);
        const row = t.app.db.get('SELECT status,full_name,phone,secondary_phone,email,token_version FROM users WHERE id=?', userId);
        assert.equal(row.status, 'DELETED');
        assert.equal(row.full_name, 'حساب محذوف');
        assert.match(row.phone, /^\+999[0-9a-f]{12}$/);
        assert.equal(row.secondary_phone, null);
        assert.equal(row.email, null);
        assert.equal((await t.api('GET', '/api/v1/me/profile', { token })).status, 401);
        const active = await t.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: registered.body.user.phone } });
        assert.notEqual(active.status, 500);
    }
    finally {
        await t.close();
    }
});
test('V85.1: administrator cannot self-delete through customer account endpoint', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const response = await t.api('DELETE', '/api/v1/me/account', { token: admin, body: { confirmation: 'DELETE' } });
        assert.equal(response.status, 403);
    }
    finally {
        await t.close();
    }
});
test('V85.1: account deletion is blocked while customer has an active order', async () => {
    const t = await startApp();
    try {
        const registered = await registerUser(t.api);
        const token = registered.body.accessToken;
        const categories = (await t.api('GET', '/api/v1/categories')).body.categories;
        const service = categories.flatMap((x) => x.services || []).find((x) => x.isActive !== false);
        assert.ok(service, 'test catalog should contain an active service');
        const order = await t.api('POST', '/api/v1/orders', { token, body: { serviceId: service.id, description: 'أحتاج هذه الخدمة وأرغب في تنفيذها', contactPhone: registered.body.user.phone, location: { lat: 15.35, lng: 44.2, source: 'gps' } } });
        assert.equal(order.status, 201, order.text);
        const deleted = await t.api('DELETE', '/api/v1/me/account', { token, body: { confirmation: 'DELETE' } });
        assert.equal(deleted.status, 409, deleted.text);
        assert.equal(deleted.body.error.code, 'ACCOUNT_HAS_ACTIVE_ORDERS');
        assert.equal(t.app.db.get('SELECT status FROM users WHERE id=?', registered.body.user.id).status, 'ACTIVE');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v85_1_account_management.test.js.map