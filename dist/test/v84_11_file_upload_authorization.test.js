import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]).toString('base64');
async function upload(api, token, purpose) {
    return api('POST', '/api/v1/files', { token, body: { purpose, name: 'test.png', dataBase64: png } });
}
test('V84.11: upload purpose is restricted by role at the API boundary', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const provider = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم اختبار الملفات' } });
        assert.equal(customer.status, 201, customer.text);
        assert.equal(provider.status, 201, provider.text);
        for (const purpose of ['provider_document', 'work_photo', 'service_icon']) {
            const result = await upload(t.api, customer.body.accessToken, purpose);
            assert.equal(result.status, 403, `${purpose}: ${result.text}`);
            assert.equal(result.body.error?.code, 'FILE_PURPOSE_FORBIDDEN');
        }
        assert.equal((await upload(t.api, customer.body.accessToken, 'avatar')).status, 201);
        assert.equal((await upload(t.api, customer.body.accessToken, 'order_attachment')).status, 201);
        assert.equal((await upload(t.api, provider.body.accessToken, 'provider_document')).status, 201);
        assert.equal((await upload(t.api, provider.body.accessToken, 'work_photo')).status, 201);
        assert.equal((await upload(t.api, provider.body.accessToken, 'avatar')).status, 201);
        assert.equal((await upload(t.api, provider.body.accessToken, 'service_icon')).status, 403);
    }
    finally {
        await t.close();
    }
});
test('V84.11: failed storage writes roll back the database row and clean partial bytes', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const originalSave = t.app.storage.save.bind(t.app.storage);
        t.app.storage.save = (key, data) => { originalSave(key, data); throw new Error('simulated disk failure after partial write'); };
        const before = t.app.db.get('SELECT COUNT(*) AS n FROM files WHERE owner_id=?', customer.body.user.id).n;
        const result = await upload(t.api, customer.body.accessToken, 'avatar');
        assert.equal(result.status, 500, result.text);
        assert.equal(t.app.db.get('SELECT COUNT(*) AS n FROM files WHERE owner_id=?', customer.body.user.id).n, before);
        t.app.storage.save = originalSave;
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v84_11_file_upload_authorization.test.js.map