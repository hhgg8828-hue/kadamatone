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
//# sourceMappingURL=config-validation.test.js.map