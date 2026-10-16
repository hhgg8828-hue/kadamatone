import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrackingProductLines } from '../public/service-filter-logic.js';
import { SseHub, type SseRes } from '../src/core/sse.js';

const appSource = readFileSync('public/app.ts', 'utf8');

test('2.86: tracking uses the saved quantity aliases and derives unit price from the actual total', () => {
  const rows = parseTrackingProductLines('', 'عامل يومين', { workers: 5 }, 37500);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[0].unitPrice, 7500);
  assert.equal(rows[0].lineTotal, 37500);
  const explicit = parseTrackingProductLines('عامل يومين — الكمية: 5', 'عامل يومين', {}, 37500);
  assert.equal(explicit[0].quantity, 5);
  assert.equal(explicit[0].lineTotal, 37500);
});

test('2.86: checkout section suggestions are sourced from admin-managed stores, not every catalog category', () => {
  assert.match(appSource, /const loadManagedStores=async\(\)=>/);
  assert.match(appSource, /api\('\/order-stores'\)/);
  assert.match(appSource, /checkout-recommended-store-card/);
  assert.match(appSource, /data-suggested-section-id/);
  assert.match(appSource, /زر «المتاجر»/);
  assert.ok(!/const catalogCategories=flattenForCheckout/.test(appSource));
});

test('2.86: anonymous realtime subscribers receive only public catalog/configuration sync events', () => {
  const hub = new SseHub();
  const chunks: string[] = [];
  const res: SseRes = {
    write(chunk: string) { chunks.push(chunk); return true; },
    end() {},
    on() {},
  };
  hub.addPublic(res);
  hub.broadcast('sync', { scope: 'catalog' });
  hub.broadcast('sync', { scope: 'order-stores' });
  hub.broadcast('sync', { scope: 'orders', orderId: 'private-order-id' });
  hub.broadcast('notification', { title: 'private notification' });
  assert.equal(chunks.filter(x => x.includes('event: sync')).length, 2);
  assert.ok(chunks.some(x => x.includes('"scope":"catalog"')));
  assert.ok(chunks.some(x => x.includes('"scope":"order-stores"')));
  assert.ok(!chunks.some(x => x.includes('private-order-id')));
  assert.ok(!chunks.some(x => x.includes('private notification')));
  hub.closeAll();
});

test('2.86: admin has explicit review, callback scheduling, return-to-waiting and confirmed cancellation actions', () => {
  for (const text of ['تأكيد الطلب', 'تعليق للمراجعة', 'جدولة المتابعة', 'إعادة إلى الانتظار', 'رفض الطلب / إلغاءه', 'الاتصال بالعميل']) {
    assert.ok(appSource.includes(text), `missing admin action: ${text}`);
  }
  assert.match(appSource, /showExitConfirmation\(\(\)=>/);
  assert.match(appSource, /هل أنت متأكد من الخروج من البرنامج\؟/);
});

test('2.86: the public SSE endpoint streams an admin-managed store update to a guest without authentication', async () => {
  const { startApp, loginAdmin } = await import('./helpers.js');
  const t = await startApp();
  let received = '';
  let resolveReady!: () => void;
  let resolveStoreUpdate!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const storeUpdate = new Promise<void>(resolve => { resolveStoreUpdate = resolve; });
  const http: any = await import('node:http');
  const req: any = http.request(new URL('/api/v1/events/public', t.base));
  req.on('response', (response: any) => {
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers['content-type'] || ''), /text\/event-stream/);
    response.on('data', (chunk: any) => {
      received += String(chunk);
      if (received.includes('public-catalog')) resolveReady();
      if (received.includes('"scope":"order-stores"')) resolveStoreUpdate();
    });
  });
  try {
    req.end();
    await Promise.race([ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('لم تبدأ قناة التحديث العامة')), 2500))]);
    const token = await loginAdmin(t.api);
    const created = await t.api('POST', '/api/v1/admin/order-stores', { token, body: { storeName: 'قسم اختبار', categoryName: 'خدمات المنزل', description: 'اختبار بث عام', featuredItems: '', deliveryFee: 0, minimumOrder: 0, sortOrder: 1, isActive: true } });
    assert.equal(created.status, 200, created.text);
    await Promise.race([storeUpdate, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('لم يصل تحديث المتجر إلى قناة الزائر')), 2500))]);
    assert.ok(received.includes('"scope":"order-stores"'));
  } finally {
    req.destroy();
    await t.close();
  }
});

test('2.86: admin execution scheduling is separate from callback scheduling and notifies the customer', async () => {
  const { startApp, registerUser, loginAdmin } = await import('./helpers.js');
  const t = await startApp();
  try {
    const customer = await registerUser(t.api);
    const service = t.app.db.get<{id:string}>('SELECT id FROM services WHERE slug=?', 'air-conditioning');
    const serviceId = String(service?.id || '');
    assert.ok(serviceId);
    const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId, description: 'المكيف لا يبرد', contactPhone: '+967771112233', location: { lat: 12.79, lng: 45.02, source: 'gps' }, formData: { ac_type: 'split', brand: 'LG' } } });
    assert.equal(created.status, 201, created.text);
    const admin = await loginAdmin(t.api);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const result = await t.api('PATCH', `/api/v1/admin/operations/orders/${created.body.order.id}/schedule`, { token: admin, body: { scheduledAt, note: 'موعد اتفق عليه العميل' } });
    assert.equal(result.status, 200, result.text);
    assert.equal(new Date(result.body.scheduledAt).toISOString(), new Date(scheduledAt).toISOString());
    const saved = t.app.db.get<{scheduled_at:string}>('SELECT scheduled_at FROM orders WHERE id=?', created.body.order.id);
    assert.equal(new Date(saved!.scheduled_at).toISOString(), new Date(scheduledAt).toISOString());
    const notifications = await t.api('GET', '/api/v1/notifications?limit=100', { token: customer.body.accessToken });
    assert.ok((notifications.body.notifications || []).some((n:any) => n.type === 'ORDER_EXECUTION_SCHEDULED'));
    const past = await t.api('PATCH', `/api/v1/admin/operations/orders/${created.body.order.id}/schedule`, { token: admin, body: { scheduledAt: new Date(Date.now() - 60_000).toISOString() } });
    assert.equal(past.status, 422);
  } finally { await t.close(); }
});
