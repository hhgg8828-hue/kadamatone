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
    assert.equal(requested.body.channel, 'TEST');
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


  test('Railway test deployment works without OTP environment variables when APP_ENV is omitted', async () => {
    const staging = await startApp({
      NODE_ENV: 'production', WHATSAPP_OTP_ENABLED: 'false',
      ADMIN_PASSWORD: 'StrongAdminPassword123!',
      JWT_SECRET: 'staging-default-secret-that-is-at-least-32-characters-long',
    });
    try {
      assert.equal(staging.app.config.appEnv, 'staging');
      assert.equal(staging.app.config.whatsappOtpTestMode, true);
      const requested = await staging.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: '+967773456789' } });
      assert.equal(requested.status, 200, requested.text);
      assert.equal(requested.body.channel, 'TEST');
      assert.match(requested.body.devCode, /^\d{4}$/);
      const verified = await staging.api('POST', '/api/v1/auth/whatsapp/verify', { body: { phone: '+967773456789', code: requested.body.devCode } });
      assert.equal(verified.status, 200, verified.text);
    } finally { await staging.close(); }
  });

  test('الإنتاج لا يعيد رمزًا تجريبيًا عند تعطيل واتساب', async () => {
    const prod = await startApp({ NODE_ENV: 'production', APP_ENV: 'production', WHATSAPP_OTP_ENABLED: 'false' });
    try {
      const requested = await prod.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: '+967773456789' } });
      assert.equal(requested.status, 503, requested.text);
      assert.equal(requested.body.error.code, 'WHATSAPP_OTP_DISABLED');
      assert.equal(requested.body.devCode, undefined);
    } finally {
      await prod.close();
    }
  });


  test('Railway staging can use free OTP only for allowlisted test phones', async () => {
    const staging = await startApp({
      NODE_ENV: 'production', APP_ENV: 'staging', WHATSAPP_OTP_ENABLED: 'false',
      WHATSAPP_OTP_TEST_MODE: 'true', WHATSAPP_OTP_TEST_PHONES: '+967771234567',
      ADMIN_PASSWORD: 'StrongAdminPassword123!',
      JWT_SECRET: 'staging-test-secret-that-is-at-least-32-characters-long',
    });
    try {
      const allowed = await staging.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: '+967771234567' } });
      assert.equal(allowed.status, 200, allowed.text);
      assert.equal(allowed.body.channel, 'TEST');
      assert.match(allowed.body.message, /لم يتم إرسال رسالة واتساب/);
      assert.match(allowed.body.devCode, /^\d{4}$/);
      const verified = await staging.api('POST', '/api/v1/auth/whatsapp/verify', { body: { phone: '+967771234567', code: allowed.body.devCode } });
      assert.equal(verified.status, 200, verified.text);
      assert.equal(verified.body.user.role, 'CUSTOMER');

      const denied = await staging.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: '+967779999999' } });
      assert.equal(denied.status, 403, denied.text);
      assert.equal(denied.body.error.code, 'OTP_TEST_PHONE_NOT_ALLOWED');
      assert.equal(denied.body.devCode, undefined);
    } finally {
      await staging.close();
    }
  });


  test('staging demo code works without a phone allowlist but remains staging-only', async () => {
    const staging = await startApp({
      NODE_ENV: 'production', APP_ENV: 'staging', WHATSAPP_OTP_ENABLED: 'false', WHATSAPP_OTP_TEST_MODE: 'true',
      ADMIN_PASSWORD: 'StrongAdminPassword123!',
      JWT_SECRET: 'staging-test-secret-that-is-at-least-32-characters-long',
    });
    try {
      const requested = await staging.api('POST', '/api/v1/auth/whatsapp/request', { body: { phone: '+967778888888' } });
      assert.equal(requested.status, 200, requested.text);
      assert.equal(requested.body.channel, 'TEST');
      const login = await staging.api('POST', '/api/v1/auth/whatsapp/verify', { body: { phone: '+967778888888', code: requested.body.devCode } });
      assert.equal(login.status, 200, login.text);
      assert.equal(login.body.user.phone, '+967778888888');
    } finally { await staging.close(); }
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
