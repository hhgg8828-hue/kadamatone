import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, loginAdmin } from './helpers.js';
const frontend = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const migration = fs.readFileSync('src/db/migrations/033_yemen_governorates_and_scoped_coverage.sql', 'utf8');
test('customer storefront keeps one quick-access box, restores ticker and image-led offer tiles', () => {
    assert.match(frontend, /id="quickAssistForm"/);
    assert.match(frontend, /id="quickAssistText"/);
    assert.match(frontend, /id="quickAssistVoice"/);
    assert.match(frontend, /khadamat-news-ticker/);
    assert.match(frontend, /customer-offers/);
    assert.match(frontend, /customer-category-rail/);
    assert.match(frontend, /customer-category-tile/);
    assert.match(frontend, /news-ticker-track/);
    assert.match(css, /campaign-image\{display:block;width:100%;height:auto;aspect-ratio:1\/1/);
    assert.match(css, /customer-category-art/);
    assert.match(frontend, /data-campaign-action/);
});
test('customer area selector hides the country root and only lists active operational areas', () => {
    assert.match(frontend, /state\.areas\.filter\(\(a:any\)=>\(a\.localityType\|\|a\.type\)!=='COUNTRY'&&a\.type!=='COUNTRY'\)/);
    assert.match(migration, /UPDATE service_areas SET is_active = 0.*system-yemen/s);
    assert.match(migration, /gov-sanaa/);
    assert.match(migration, /gov-aden/);
    assert.match(migration, /gov-ibb/);
    assert.match(frontend, /حالة التغطية/);
});
test('public configuration exposes editable brand, ticker and release information', async () => {
    const t = await startApp();
    try {
        const before = await t.api('GET', '/api/v1/config');
        assert.equal(before.status, 200);
        assert.equal(before.body.appName, 'خدمات');
        assert.ok(typeof before.body.newsTicker === 'string');
        assert.ok(typeof before.body.releaseNotes === 'string');
        const token = await loginAdmin(t.api);
        const saved = await t.api('PUT', '/api/v1/admin/settings/app.name', { token, body: { value: 'هيثم' } });
        assert.equal(saved.status, 200);
        const after = await t.api('GET', '/api/v1/config');
        assert.equal(after.body.appName, 'هيثم');
        const manifest = await t.api('GET', '/manifest-customer.webmanifest');
        assert.equal(manifest.status, 200);
        assert.match(manifest.headers.get('content-type') || '', /application\/manifest\+json/);
        assert.match(manifest.body.name, /^هيثم/);
    }
    finally {
        await t.close();
    }
});
test('area creation can be staged inactive and does not expose whole-country coverage', async () => {
    const t = await startApp({ __keepCountryInactive: true });
    try {
        const activeAreas = await t.api('GET', '/api/v1/areas');
        assert.equal(activeAreas.status, 200);
        assert.ok(activeAreas.body.areas.some((a) => a.id === 'gov-ibb'));
        assert.ok(!activeAreas.body.areas.some((a) => a.type === 'COUNTRY'));
        const token = await loginAdmin(t.api);
        const created = await t.api('POST', '/api/v1/admin/areas', { token, body: {
                name: { ar: 'مديرية اختبار', en: 'Test Directorate' }, type: 'DISTRICT', localityType: 'DIRECTORATE', parentId: 'gov-ibb', centerLat: 13.97, centerLng: 44.17, radiusKm: 8, isActive: false,
            } });
        assert.equal(created.status, 201, created.text);
        const activeAfter = await t.api('GET', '/api/v1/areas');
        assert.ok(!activeAfter.body.areas.some((a) => a.id === created.body.area.id));
        const country = t.app.db.get("SELECT is_active FROM service_areas WHERE id='system-yemen'");
        assert.equal(country?.is_active, 0);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_15_coverage_brand_storefront.test.js.map