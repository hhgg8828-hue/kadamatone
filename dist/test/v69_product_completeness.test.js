import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';
test('V69: الطلب يدعم رسالة صوتية داخل محادثة الطلب مع صلاحية الملف للطرف المرتبط', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', fullName: 'مقدم صوتي', phone: '+967770001299', email: 'voice69@example.com', password: 'Demo12345', provider: { providerType: 'DRIVER', displayName: 'مقدم صوتي', bio: '', specialty: 'نقل' } });
        const svc = t.app.db.get(`SELECT id FROM services WHERE slug='custom-request'`);
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v69-order' }, body: { serviceId: svc.id, description: 'اختبار صوتي', contactPhone: c.body.user.phone } });
        assert.equal(order.status, 201, order.text);
        const oid = order.body.order.id;
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run(`UPDATE orders SET provider_id=?,status='ACCEPTED' WHERE id=?`, pid, oid);
        const file = await t.api('POST', '/api/v1/files', { token: c.body.accessToken, body: { purpose: 'order_attachment', name: 'voice.webm', dataBase64: 'data:audio/webm;base64,GkXfow==' } });
        assert.equal(file.status, 201, file.text);
        const msg = await t.api('POST', `/api/v1/orders/${oid}/messages`, { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v69-msg' }, body: { body: '🎙️ رسالة صوتية', attachmentFileIds: [file.body.file.id] } });
        assert.equal(msg.status, 201, msg.text);
        assert.equal(msg.body.message.attachments[0].mime, 'audio/webm');
        const providerFile = await t.api('GET', `/api/v1/files/${file.body.file.id}`, { token: p.body.accessToken });
        assert.equal(providerFile.status, 200, providerFile.text);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v69_product_completeness.test.js.map