import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';

let t: Awaited<ReturnType<typeof startApp>>;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

async function serviceId() {
  const categories = (await t.api('GET', '/api/v1/categories')).body.categories;
  const service = categories.flatMap((x: any) => x.services || []).find((x: any) => x.slug === 'air-conditioning') || categories.flatMap((x: any) => x.services || []).find((x: any) => x.slug !== 'motorcycle-trips');
  assert.ok(service);
  return service.id as string;
}

test('V84.5: إنشاء الطلب يرفض المرفقات غير المملوكة بدل إسقاطها بصمت', async () => {
  const c = await registerUser(t.api);
  const before = t.app.db.get<any>('SELECT COUNT(*) n FROM orders WHERE customer_id=?', c.body.user.id).n;
  const result = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: {
    serviceId: await serviceId(), description: 'اختبار رفض مرفق غير صالح', contactPhone: c.creds.phone,
    location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 }, attachmentFileIds: ['not-owned-or-existent-file']
  }});
  assert.equal(result.status, 422, result.text);
  assert.equal(result.body.error?.code, 'INVALID_ATTACHMENT');
  assert.equal(t.app.db.get<any>('SELECT COUNT(*) n FROM orders WHERE customer_id=?', c.body.user.id).n, before);
});

test('V84.5: إنشاء الطلب يرفض مستفيدًا بحساب غير موجود', async () => {
  const c = await registerUser(t.api);
  const result = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: {
    serviceId: await serviceId(), description: 'اختبار مستفيد بحساب غير موجود', contactPhone: c.creds.phone,
    location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 }, recipientUserId: 'missing-recipient-user'
  }});
  assert.equal(result.status, 422, result.text);
  assert.equal(result.body.error?.code, 'INVALID_RECIPIENT');
});

test('V84.5: رفع الملفات يرفض Base64 غير صالح قبل تخزينه', async () => {
  const c = await registerUser(t.api);
  const result = await t.api('POST', '/api/v1/files', { token: c.body.accessToken, body: {
    purpose: 'avatar', name: 'bad.jpg', dataBase64: 'data:image/jpeg;base64,/9j!4AAQSkZJRg=='
  }});
  assert.equal(result.status, 422, result.text);
  assert.equal(result.body.error?.code, 'INVALID_BASE64');
  assert.equal(t.app.db.get<any>('SELECT COUNT(*) n FROM files WHERE owner_id=?', c.body.user.id).n, 0);
});

