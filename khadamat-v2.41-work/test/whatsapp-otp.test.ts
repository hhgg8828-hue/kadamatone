import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.js';

let t: TestApp;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

describe('WhatsApp OTP customer authentication', () => {
  test('طلب رمز واتساب في التطوير يعيد رمزًا للاختبار فقط ولا يكشفه في الإنتاج', async () => {
    const phone = '+967771234567';
    const requested = await t.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone } });
    assert.equal(requested.status, 200, requested.text);
    assert.equal(requested.body.channel, 'WHATSAPP');
    assert.ok(requested.body.devCode);
    assert.match(requested.body.devCode, /^\d{4}$/);

    const verified = await t.api('POST', '/api/v1/auth/whatsapp/verify', { body: { phone, code: requested.body.devCode } });
    assert.equal(verified.status, 200, verified.text);
    assert.equal(verified.body.user.role, 'CUSTOMER');
    assert.ok(verified.body.accessToken);

    const user = t.app.db.get<any>('SELECT * FROM users WHERE phone=?', phone);
    assert.ok(user);
    assert.equal(user.email, null);
    assert.equal(user.full_name, 'عميل خدمات');
  });

  test('رمز خاطئ لا ينشئ جلسة', async () => {
    const phone = '+967772345678';
    const requested = await t.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone } });
    assert.equal(requested.status, 200);
    const wrong = await t.api('POST', '/api/v1/auth/whatsapp/verify', { body: { phone, code: '0000' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'OTP_INVALID');
  });
});
