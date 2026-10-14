import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';

test('V70 provider can open and reply in the same order chat', async () => {
  const t = await startApp();
  try {
    const c = await registerUser(t.api, { fullName: 'عميل الدردشة', phone: '+96777770001' });
    const p = await registerUser(t.api, { role: 'PROVIDER', fullName: 'مقدم الدردشة', phone: '+96777770002', email: 'chat-provider-v70@test.local', provider: { providerType: 'DRIVER', displayName: 'مقدم الدردشة' } });
    assert.equal(c.status, 201, c.text);
    assert.equal(p.status, 201, p.text);

    const service = t.app.db.get<any>(`SELECT id FROM services WHERE slug='custom-request'`);
    assert.ok(service, 'custom-request service must exist');

    const created = await t.api('POST', '/api/v1/orders', {
      token: c.body.accessToken,
      headers: { 'Idempotency-Key': 'v70-chat-order' },
      body: {
        serviceId: service.id,
        description: 'أحتاج خدمة للدردشة',
        contactPhone: c.body.user.phone,
        location: { lat: 13.58, lng: 44.02, accuracy: 20 }
      }
    });
    assert.equal(created.status, 201, created.text);
    const orderId = created.body.order.id as string;
    const providerId = t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id)?.id;
    assert.ok(providerId, 'provider record must exist');

    // Simulate a legitimately assigned/accepted provider without depending on a particular discovery seed.
    t.app.db.run(`UPDATE orders SET provider_id=?, status='ACCEPTED', updated_at=? WHERE id=?`, providerId, new Date().toISOString(), orderId);

    const fromCustomer = await t.api('POST', `/api/v1/orders/${orderId}/messages`, {
      token: c.body.accessToken,
      headers: { 'Idempotency-Key': 'v70-c' },
      body: { body: 'أين أنت؟' }
    });
    assert.equal(fromCustomer.status, 201, fromCustomer.text);

    const providerRead = await t.api('GET', `/api/v1/orders/${orderId}/messages`, { token: p.body.accessToken });
    assert.equal(providerRead.status, 200, providerRead.text);
    assert.equal(providerRead.body.messages.at(-1).body, 'أين أنت؟');

    const reply = await t.api('POST', `/api/v1/orders/${orderId}/messages`, {
      token: p.body.accessToken,
      headers: { 'Idempotency-Key': 'v70-p' },
      body: { body: 'أنا قريب منك' }
    });
    assert.equal(reply.status, 201, reply.text);

    const customerRead = await t.api('GET', `/api/v1/orders/${orderId}/messages`, { token: c.body.accessToken });
    assert.equal(customerRead.status, 200, customerRead.text);
    assert.equal(customerRead.body.messages.at(-1).body, 'أنا قريب منك');
  } finally {
    await t.close();
  }
});
