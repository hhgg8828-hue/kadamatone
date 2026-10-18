import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
const base = {
    __skipDotEnv: true,
    NODE_ENV: 'production',
    ADMIN_PASSWORD: 'StrongAdminPassword123!',
    JWT_SECRET: 'production-test-secret-that-is-at-least-32-characters-long',
    ADMIN_EMAIL: 'admin@example.test',
    WHATSAPP_OTP_ENABLED: 'false',
};
test('configuration rejects invalid ports and non-positive session TTLs', () => {
    assert.throws(() => loadConfig({ ...base, PORT: '70000' }), /PORT must be an integer/);
    assert.throws(() => loadConfig({ ...base, PORT: 'abc' }), /PORT must be an integer/);
    assert.throws(() => loadConfig({ ...base, PORT: '3000abc' }), /PORT must be an integer/);
    assert.throws(() => loadConfig({ ...base, ACCESS_TTL_SEC: '900.5' }), /ACCESS_TTL_SEC must be a positive integer/);
    assert.throws(() => loadConfig({ ...base, ACCESS_TTL_SEC: '0' }), /ACCESS_TTL_SEC must be a positive integer/);
    assert.throws(() => loadConfig({ ...base, REFRESH_TTL_DAYS: '-1' }), /REFRESH_TTL_DAYS must be a positive integer/);
});
test('production refuses enabled WhatsApp OTP without the credentials needed to send it', () => {
    assert.throws(() => loadConfig({ ...base, WHATSAPP_OTP_ENABLED: 'true' }), /WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required/);
    const config = loadConfig({ ...base, WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '12345' });
    assert.equal(config.whatsappOtpEnabled, true);
});
test('production rejects weak or placeholder administrator passwords', () => {
    assert.throws(() => loadConfig({ ...base, ADMIN_PASSWORD: 'Admin123!' }), /at least 12 characters/);
    assert.throws(() => loadConfig({ ...base, ADMIN_PASSWORD: 'onlylowercasepassword' }), /at least 3 character classes/);
    assert.throws(() => loadConfig({ ...base, ADMIN_PASSWORD: 'replace-with-a-StrongPassword123!' }), /placeholder or common password/);
    assert.equal(loadConfig({ ...base, ADMIN_PASSWORD: 'StrongAdminPassword123!' }).isProd, true);
});
test('production refuses insecure refresh-token cookies', () => {
    assert.throws(() => loadConfig({ ...base, COOKIE_SECURE: 'false' }), /COOKIE_SECURE must be true in production/);
    assert.equal(loadConfig({ ...base }).cookieSecure, true);
});
test('Railway production runtime defaults to staging demo OTP when APP_ENV is omitted and WhatsApp is disabled', () => {
    const config = loadConfig({ ...base });
    assert.equal(config.appEnv, 'staging');
    assert.equal(config.whatsappOtpTestMode, true);
    assert.equal(config.isProd, true, 'production-grade secret and cookie checks remain active');
    const explicitProduction = loadConfig({ ...base, APP_ENV: 'production' });
    assert.equal(explicitProduction.appEnv, 'production');
    assert.equal(explicitProduction.whatsappOtpTestMode, false);
});
test('free OTP test mode is staging-only; phone allowlist is optional', () => {
    assert.throws(() => loadConfig({ ...base, APP_ENV: 'production', WHATSAPP_OTP_TEST_MODE: 'true', WHATSAPP_OTP_TEST_PHONES: '+967771234567' }), /only allowed when APP_ENV=staging/);
    const withoutAllowlist = loadConfig({ ...base, APP_ENV: 'staging', WHATSAPP_OTP_TEST_MODE: 'true' });
    assert.deepEqual(withoutAllowlist.whatsappOtpTestPhones, []);
    assert.throws(() => loadConfig({ ...base, APP_ENV: 'staging', WHATSAPP_OTP_TEST_MODE: 'true', WHATSAPP_OTP_TEST_PHONES: '+967771234567', WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '12345' }), /Disable WHATSAPP_OTP_ENABLED/);
    assert.throws(() => loadConfig({ ...base, APP_ENV: 'production', WHATSAPP_OTP_TEST_MODE: 'true', WHATSAPP_OTP_TEST_PHONES: '+967771234567' }), /only allowed when APP_ENV=staging/);
    const config = loadConfig({ ...base, APP_ENV: 'staging', WHATSAPP_OTP_TEST_MODE: 'true', WHATSAPP_OTP_TEST_PHONES: '+967771234567' });
    assert.equal(config.isProd, true, 'staging retains production-grade cookie and secret checks');
    assert.equal(config.appEnv, 'staging');
    assert.equal(config.whatsappOtpTestMode, true);
    assert.deepEqual(config.whatsappOtpTestPhones, ['+967771234567']);
});
//# sourceMappingURL=config-validation.test.js.map