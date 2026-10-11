import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';

let t: Awaited<ReturnType<typeof startApp>>;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

async function createOrder(suffix: string) {
  const customer = await registerUser(t.api);
  const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v839-${suffix}-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: `مقدم ${suffix}` } });
  const categories = (await t.api('GET', '/api/v1/categories')).body.categories;
  const service = categories.flatMap((x: any) => x.services || []).find((x: any) => x.slug !== 'motorcycle-trips');
  assert.ok(service);
  const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: `اختبار الإلغاء ${suffix}`, contactPhone: customer.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 } } });
  assert.equal(created.status, 201, created.text);
  const providerId = t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
  assert.ok(providerId);
  const orderId = created.body.order.id as string;
  const offerId = `v839-${suffix}-${Date.now()}`;
  const now = new Date().toISOString();
  t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", offerId, orderId, providerId, now, new Date(Date.now() + 120_000).toISOString());
  const accepted = await t.api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.body.accessToken, body: {} });
  assert.equal(accepted.status, 200, accepted.text);
  return { customer, provider, providerId, orderId };
}

test('V83.9: إلغاء مقدم الخدمة بعد القبول يعيد الطلب للبحث دون الاحتفاظ بإسناد قديم', async () => {
  const f = await createOrder('provider-cancel');
  const response = await t.api('POST', `/api/v1/orders/${f.orderId}/cancel`, { token: f.provider.body.accessToken, body: { reason: 'تعذر الحضور' } });
  assert.equal(response.status, 200, response.text);
  const order = t.app.db.get<any>('SELECT status,provider_id,accepted_at FROM orders WHERE id=?', f.orderId);
  assert.equal(order.provider_id, null);
  assert.equal(order.accepted_at, null);
  assert.ok(['SEARCHING', 'ASSIGNED'].includes(order.status), `unexpected status: ${order.status}`);
  assert.equal(t.app.db.get<any>("SELECT status FROM order_assignments WHERE order_id=? AND provider_id=?", f.orderId, f.providerId)?.status, 'REJECTED');
  const history = t.app.db.all<any>('SELECT from_status,to_status,actor_role FROM order_status_history WHERE order_id=? ORDER BY id', f.orderId);
  assert.ok(history.some((h: any) => h.from_status === 'ACCEPTED' && h.to_status === 'SEARCHING' && h.actor_role === 'SYSTEM'));
  const oldProviderRead = await t.api('GET', `/api/v1/orders/${f.orderId}`, { token: f.provider.body.accessToken });
  assert.equal(oldProviderRead.status, 404, oldProviderRead.text);
  const payment = t.app.db.get<any>('SELECT status,provider_ref FROM payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1', f.orderId);
  assert.equal(payment.status, 'FAILED', 'pending payment from the previous acceptance must be closed');
  assert.equal(payment.provider_ref, 'provider_reassigned');
});

test('V83.9: إلغاء العميل بعد قبول مقدم الخدمة يغلق الطلب ويسحب العروض المفتوحة', async () => {
  const f = await createOrder('customer-cancel');
  const response = await t.api('POST', `/api/v1/orders/${f.orderId}/cancel`, { token: f.customer.body.accessToken, body: { reason: 'لم أعد بحاجة للخدمة' } });
  assert.equal(response.status, 200, response.text);
  const order = t.app.db.get<any>('SELECT status,cancelled_by_role,cancel_reason FROM orders WHERE id=?', f.orderId);
  assert.equal(order.status, 'CANCELLED');
  assert.equal(order.cancelled_by_role, 'CUSTOMER');
  assert.equal(order.cancel_reason, 'لم أعد بحاجة للخدمة');
  assert.equal(t.app.db.get<any>("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND status='OFFERED'", f.orderId).n, 0);
  const history = t.app.db.all<any>('SELECT from_status,to_status,actor_role FROM order_status_history WHERE order_id=? ORDER BY id', f.orderId);
  assert.ok(history.some((h: any) => h.from_status === 'ACCEPTED' && h.to_status === 'CANCELLED' && h.actor_role === 'CUSTOMER'));
  // The previously assigned provider may retain read-only access to the cancelled order history.
  const providerRead = await t.api('GET', `/api/v1/orders/${f.orderId}`, { token: f.provider.body.accessToken });
  assert.equal(providerRead.status, 200, providerRead.text);
  const forbiddenTransition = await t.api('POST', `/api/v1/provider/orders/${f.orderId}/status`, { token: f.provider.body.accessToken, body: { to: 'IN_PROGRESS' } });
  assert.notEqual(forbiddenTransition.status, 200, forbiddenTransition.text);
});

test('V83.9: لا تُلغى الخدمة مرتين بطلبين متزامنين', async () => {
  const f = await createOrder('double-cancel');
  const results = await Promise.all([
    t.api('POST', `/api/v1/orders/${f.orderId}/cancel`, { token: f.customer.body.accessToken, body: { reason: 'إلغاء 1' } }),
    t.api('POST', `/api/v1/orders/${f.orderId}/cancel`, { token: f.customer.body.accessToken, body: { reason: 'إلغاء 2' } }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => `${r.status}: ${r.text}`).join('\n'));
  assert.equal(t.app.db.get<any>("SELECT COUNT(*) n FROM order_status_history WHERE order_id=? AND to_status='CANCELLED'", f.orderId).n, 1);
});

test('V83.9: جميع واجهات PWA تستخدم ملفات الأصول وذاكرة التخزين المؤقت الحالية', () => {
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
    assert.ok(fs.readFileSync(file, 'utf8').includes('v=84.10'), file);
  }
  assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v84-10'));
});
