import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';

let t: Awaited<ReturnType<typeof startApp>>;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

async function createTaskOrder(suffix: string) {
  const customer = await registerUser(t.api);
  const provider = await registerUser(t.api, { role: 'PROVIDER', email: `v844-${suffix}-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: `مقدم ${suffix}` } });
  const categories = (await t.api('GET', '/api/v1/categories')).body.categories;
  const service = categories.flatMap((x: any) => x.services || []).find((x: any) => x.slug !== 'motorcycle-trips');
  assert.ok(service);
  const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: `اختبار مهام التنفيذ ${suffix}`, contactPhone: customer.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 }, tasks: [{ title: 'تنفيذ المهمة', taskType: 'GENERAL' }] } });
  assert.equal(created.status, 201, created.text);
  const providerId = t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?', provider.body.user.id)?.id;
  const orderId = created.body.order.id as string;
  const taskId = t.app.db.get<any>('SELECT id FROM order_tasks WHERE order_id=?', orderId)?.id;
  assert.ok(providerId && taskId);
  const offerId = `v844-${suffix}-${Date.now()}`;
  const now = new Date().toISOString();
  t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", offerId, orderId, providerId, now, new Date(Date.now() + 120_000).toISOString());
  const accepted = await t.api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.body.accessToken, body: {} });
  assert.equal(accepted.status, 200, accepted.text);
  return { customer, provider, providerId, orderId, taskId };
}

test('V84.4: العميل لا يستطيع تغيير حالة مهام التنفيذ ولا تعديل نطاق الطلب بعد القبول', async () => {
  const f = await createTaskOrder('customer-guard');
  const taskUpdate = await t.api('PATCH', `/api/v1/orders/${f.orderId}/tasks/${f.taskId}`, { token: f.customer.body.accessToken, body: { status: 'COMPLETED' } });
  assert.equal(taskUpdate.status, 403, taskUpdate.text);
  const addTask = await t.api('POST', `/api/v1/orders/${f.orderId}/tasks`, { token: f.customer.body.accessToken, body: { tasks: [{ title: 'مهمة متأخرة' }] } });
  assert.equal(addTask.status, 422, addTask.text);
  assert.equal(t.app.db.get<any>('SELECT status FROM order_tasks WHERE id=?', f.taskId)?.status, 'PENDING');
});

test('V84.4: مقدم الخدمة لا يستطيع تخطي حالات المهمة أو إعادة فتح مهمة مكتملة', async () => {
  const f = await createTaskOrder('task-state');
  const skip = await t.api('PATCH', `/api/v1/orders/${f.orderId}/tasks/${f.taskId}`, { token: f.provider.body.accessToken, body: { status: 'COMPLETED' } });
  assert.equal(skip.status, 422, skip.text);
  const start = await t.api('PATCH', `/api/v1/orders/${f.orderId}/tasks/${f.taskId}`, { token: f.provider.body.accessToken, body: { status: 'IN_PROGRESS' } });
  assert.equal(start.status, 200, start.text);
  assert.equal(start.body.task.status, 'IN_PROGRESS');
  const complete = await t.api('PATCH', `/api/v1/orders/${f.orderId}/tasks/${f.taskId}`, { token: f.provider.body.accessToken, body: { status: 'COMPLETED' } });
  assert.equal(complete.status, 200, complete.text);
  assert.equal(complete.body.task.status, 'COMPLETED');
  const reopen = await t.api('PATCH', `/api/v1/orders/${f.orderId}/tasks/${f.taskId}`, { token: f.provider.body.accessToken, body: { status: 'IN_PROGRESS' } });
  assert.equal(reopen.status, 422, reopen.text);
  assert.equal(t.app.db.get<any>('SELECT status FROM order_tasks WHERE id=?', f.taskId)?.status, 'COMPLETED');
});

test('V84.4: مزامنة الطلبات المفتوحة لمقدم الخدمة لا تنشئ عروضًا مكررة ولا تعيد إسناد طلب أُغلق', async () => {
  const f = await createTaskOrder('open-queue');
  // الطلب مقبول في helper؛ أنشئ طلبًا مفتوحًا منفصلًا لاختبار المزامنة.
  const customer = await registerUser(t.api);
  const service = t.app.db.get<any>('SELECT service_id FROM orders WHERE id=?', f.orderId)?.service_id;
  const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service, description: 'طلب مفتوح للمزامنة', contactPhone: customer.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 } } });
  assert.equal(created.status, 201, created.text);
  const orderId = created.body.order.id as string;
  t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=13.9759,base_lng=44.1709 WHERE id=?", f.providerId);
  t.app.db.run('INSERT OR IGNORE INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,1,1)', f.providerId, service);
  const first = t.app.assignment.offerOpenOrdersToProvider(f.providerId);
  const second = t.app.assignment.offerOpenOrdersToProvider(f.providerId);
  assert.ok(first.offered >= 1);
  assert.equal(second.offered, 0);
  assert.equal(t.app.db.get<any>("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND provider_id=? AND status='OFFERED'", orderId, f.providerId).n, 1);
  const cancelledAt = new Date().toISOString();
  t.app.db.tx(() => {
    t.app.db.run("UPDATE orders SET status='CANCELLED',cancelled_at=?,updated_at=?,version=version+1 WHERE id=?", cancelledAt, cancelledAt, orderId);
    t.app.db.run("UPDATE order_assignments SET status='WITHDRAWN',responded_at=? WHERE order_id=? AND status='OFFERED'", cancelledAt, orderId);
  });
  const third = t.app.assignment.offerOpenOrdersToProvider(f.providerId);
  assert.equal(third.offered, 0);
  assert.equal(t.app.db.get<any>("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND provider_id=? AND status='OFFERED'", orderId, f.providerId).n, 0);
  assert.equal(t.app.db.get<any>("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND provider_id=?", orderId, f.providerId).n, 1);
});

test('V84.4: واجهات PWA وذاكرة التخزين المؤقت تشير إلى الإصدار الحالي', () => {
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.34'), file);
  assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-34'));
});
