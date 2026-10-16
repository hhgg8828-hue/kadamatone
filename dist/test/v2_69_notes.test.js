import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, loginAdmin } from './helpers.js';
const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const catalog = fs.readFileSync('src/modules/catalog.ts', 'utf8');
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
test('v2.69: admin catalog can add a service directly to each category', () => {
    assert.match(app, /data-add-service-category=/);
    assert.match(app, /openServiceEditor\(null,cats,draw,allServices,\(x as HTMLElement\)\.dataset\.addServiceCategory/);
    assert.match(app, /const initialCategoryId=sv\?\.categoryId\|\|preferredCategoryId\|\|cats\[0\]\?\.id\|\|''/);
    assert.match(app, /id="newService"/);
    assert.match(catalog, /r\.post\('\/admin\/services'/);
});
test('v2.69: category save reports validation/server errors in the form and confirms successful creation', () => {
    assert.match(app, /id="categoryEditorError"/);
    assert.match(app, /تعذر حفظ القسم:/);
    assert.match(app, /تمت إضافة القسم/);
    assert.match(app, /body\.slug=uniqueSlug/);
    assert.match(catalog, /INSERT INTO categories/);
});
test('v2.69: dark mode covers the bottom navigation, account and quick access surfaces using navy colors', () => {
    assert.match(css, /--theme-bg:#111e32/);
    assert.match(css, /:root\[data-theme="dark"\] \.customer-bottom-nav/);
    assert.match(css, /:root\[data-theme="dark"\] \.account-menu-list/);
    assert.match(css, /:root\[data-theme="dark"\] \.quick-access-card/);
});
test('v2.69: toasts are centered and constrained to mobile viewport safe areas', () => {
    assert.match(app, /left:max\(12px,env\(safe-area-inset-left,0px\)\)/);
    assert.match(app, /right:max\(12px,env\(safe-area-inset-right,0px\)\)/);
    assert.match(css, /\.live-toast\{display:none;box-sizing:border-box;width:min\(100%,520px\);max-width:100%;min-width:0;margin-inline:auto/);
    assert.match(css, /overflow-wrap:anywhere/);
});
test('v2.71: all app shell assets and service-worker cache use the current release version', () => {
    assert.equal(version, '2.71');
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes(`app.js?v=${version}`), `${file} JS version`);
        assert.ok(html.includes(`app.css?v=${version}`), `${file} CSS version`);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-71'));
});
test('v2.69: admin can persist a new department and add multiple services into it', async () => {
    const t = await startApp();
    try {
        const token = await loginAdmin(t.api);
        const category = await t.api('POST', '/api/v1/admin/categories', { token, body: { slug: `travel-${Date.now()}`, name: { ar: 'سياحة وسفر', en: 'Travel' }, defaultPricingType: 'QUOTE' } });
        assert.equal(category.status, 201, category.text);
        const categoryId = category.body.category.id;
        for (const [name, slug] of [['فيزا عمل', 'work-visa'], ['فيزا عمرة', 'umrah-visa'], ['فيزا حج', 'hajj-visa']]) {
            const created = await t.api('POST', '/api/v1/admin/services', { token, body: { categoryId, slug: `${slug}-${Date.now()}-${name.length}`, name: { ar: name, en: slug }, pricingType: 'QUOTE', formSchema: [] } });
            assert.equal(created.status, 201, created.text);
            assert.equal(created.body.service.categoryId, categoryId);
        }
        const catalogResponse = await t.api('GET', '/api/v1/admin/catalog', { token });
        const saved = catalogResponse.body.categories.find((x) => x.id === categoryId);
        assert.ok(saved, 'new category appears in admin catalog after saving');
        assert.deepEqual(saved.services.map((x) => x.name).sort(), ['فيزا حج', 'فيزا عمل', 'فيزا عمرة'].sort());
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_69_notes.test.js.map