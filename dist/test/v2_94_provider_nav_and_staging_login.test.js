import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const config = readFileSync('src/config.ts', 'utf8');
const auth = readFileSync('src/modules/auth.ts', 'utf8');
test('provider quick navigation uses buttons, suppresses default/ancestor actions, and scrolls without creating hash links', () => {
    const nav = app.match(/<nav class=\"provider-quick-nav\"[\s\S]*?<\/nav>/)?.[0] || '';
    assert.ok(nav.includes('data-provider-target=\"providerNotificationPanel\"'));
    assert.equal((nav.match(/data-provider-target=/g) || []).length, 8);
    assert.equal(/href=\"#/.test(nav), false);
    assert.match(app, /provider-quick-nav \[data-provider-target\][\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?scrollIntoView/);
});
test('staging demo login does not send WhatsApp and never permits test mode in production APP_ENV', () => {
    assert.match(auth, /if \(config\.whatsappOtpTestMode\) \{/);
    assert.match(config, /whatsappOtpTestMode && appEnv !== 'staging'/);
    assert.match(auth, /whatsappOtpTestPhones\.length > 0/);
});
test('staging defaults are automatic when Railway has NODE_ENV=production but APP_ENV is omitted', () => {
    const config = readFileSync('src/config.ts', 'utf8');
    assert.match(config, /env\.APP_ENV \|\| \(isProd \? 'staging' : 'development'\)/);
    assert.match(config, /appEnv === 'staging' && !whatsappOtpEnabled/);
});
//# sourceMappingURL=v2_94_provider_nav_and_staging_login.test.js.map