import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, loginAdmin } from './helpers.js';
const frontend = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const migration = fs.readFileSync('src/db/migrations/034_reinforce_operational_coverage.sql', 'utf8');
test('customer-facing promotions use compact 16:9 image cards and keep the quick-access one-box design', () => {
    assert.match(frontend, /id="quickAssistForm" class="quick-assist-card"/);
    assert.equal(/simple-request-step/.test(frontend), false);
    assert.match(frontend, /customer-offers/);
    assert.match(frontend, /data-campaign-card/);
    assert.match(css, /aspect-ratio:1\/1;object-fit:cover;border-radius:0;grid-row:auto/);
});
test('admin coverage UI supports activating and deactivating individual areas', () => {
    assert.match(frontend, /data-area-toggle/);
    assert.match(frontend, /إضافة محافظة \/ مديرية \/ حي/);
    assert.match(frontend, /مفتوحة للعملاء/);
    assert.match(migration, /gov-sanaa/);
    assert.match(migration, /gov-aden/);
    assert.match(migration, /gov-ibb/);
    assert.match(migration, /WHERE id='system-yemen'/);
});
test('regular admin can edit branding settings but not technical settings', async () => {
    const t = await startApp({ __keepCountryInactive: true });
    try {
        const superToken = await loginAdmin(t.api);
        const made = await t.api('POST', '/api/v1/admin/admins', { token: superToken, body: { fullName: 'مدير محتوى', phone: '+967711122233', email: 'content-admin@test.local', password: 'ContentAdmin123', adminLevel: 'ADMIN' } });
        assert.equal(made.status, 201, made.text);
        const logged = await t.api('POST', '/api/v1/auth/login', { body: { identifier: 'content-admin@test.local', password: 'ContentAdmin123' } });
        const token = logged.body.accessToken;
        const brand = await t.api('PUT', '/api/v1/admin/settings/app.name', { token, body: { value: 'هيثم للخدمات' } });
        assert.equal(brand.status, 200, brand.text);
        const technical = await t.api('PUT', '/api/v1/admin/settings/push.vapid_private_key', { token, body: { value: 'should-not-be-allowed' } });
        assert.equal(technical.status, 403);
        const config = await t.api('GET', '/api/v1/config');
        assert.equal(config.body.appName, 'هيثم للخدمات');
        assert.equal(config.body.appVersion, '2.87');
    }
    finally {
        await t.close();
    }
});
test('admin can activate Sana’a without activating the Yemen country root', async () => {
    const t = await startApp({ __keepCountryInactive: true });
    try {
        const token = await loginAdmin(t.api);
        const updated = await t.api('PATCH', '/api/v1/admin/areas/gov-sanaa', { token, body: { isActive: true } });
        assert.equal(updated.status, 200, updated.text);
        const areas = await t.api('GET', '/api/v1/areas');
        assert.ok(areas.body.areas.some((a) => a.id === 'gov-sanaa'));
        assert.ok(!areas.body.areas.some((a) => a.type === 'COUNTRY'));
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_17_admin_controls_and_coverage.test.js.map