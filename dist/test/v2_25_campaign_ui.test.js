import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('campaign database migration allows UI action types and stores multiple categories', () => {
    const migration = fs.readFileSync('src/db/migrations/035_campaign_categories_and_actions.sql', 'utf8');
    assert.match(migration, /'TRIP','CATEGORY','INTERNAL','URL','NONE'/);
    assert.match(migration, /category_slugs_json TEXT NOT NULL DEFAULT '\[\]'/);
    assert.match(migration, /INSERT INTO admin_campaigns_new/);
    assert.match(migration, /FROM admin_campaigns/);
});
test('campaign save validates date order and selected category slugs', () => {
    const api = fs.readFileSync('src/modules/admin.operations.ts', 'utf8');
    assert.match(api, /INVALID_DATE_RANGE/);
    assert.match(api, /INVALID_CAMPAIGN_CATEGORY/);
    assert.match(api, /category_slugs_json=COALESCE/);
    assert.match(api, /JSON\.stringify\(b\.categorySlugs\|\|\[\]\)/);
});
test('customer categories use a square all-categories tile and offers button sits outside the scrolling strip', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    assert.match(app, /class="customer-category-tile all-categories-tile" id="allCategoriesBtn"/);
    assert.match(app, /campaign-strip-wrap[\s\S]*?class="all-offers-button" id="allOffersBtn"/);
    assert.match(css, /\.customer-category-showcase-top \.all-categories-tile/);
    assert.match(css, /\.customer-shell \.all-offers-button\{position:absolute/);
});
test('asset URLs and service worker cache are bumped for 2.25', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.58'), file);
        assert.ok(html.includes('app.css?v=2.58'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-58'));
});
test('campaign schema migration preserves valid writes for category campaigns with multiple category slugs', async () => {
    const { openDb } = await import('../src/db/database.js');
    const { migrate } = await import('../src/db/migrate.js');
    const db = openDb(':memory:');
    try {
        migrate(db, { info: () => { } });
        const start = new Date(Date.now() + 60_000).toISOString();
        const end = new Date(Date.now() + 3_600_000).toISOString();
        db.run(`INSERT INTO admin_campaigns(id,title_i18n,action_type,action_value,category_slugs_json,start_at,end_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, 'campaign-multi-category-test', '{"ar":"اختبار"}', 'CATEGORY', 'delivery', '["delivery","transport"]', start, end, new Date().toISOString(), new Date().toISOString());
        const saved = db.get('SELECT action_type,category_slugs_json FROM admin_campaigns WHERE id=?', 'campaign-multi-category-test');
        assert.equal(saved?.action_type, 'CATEGORY');
        assert.deepEqual(JSON.parse(saved?.category_slugs_json || '[]'), ['delivery', 'transport']);
    }
    finally {
        db.close();
    }
});
//# sourceMappingURL=v2_25_campaign_ui.test.js.map