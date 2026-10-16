import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, loginAdmin, registerUser } from './helpers.js';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
test('v2.71 serializes dynamic boolean answers as booleans and presents yes/no choices', () => {
    assert.match(app, /f\.type==='boolean'\?`<select name=\"\$\{esc\(f\.key\)\}\"/);
    assert.match(app, /f\.type==='boolean'\?v==='true'/);
});
test('v2.71 store category selector uses categories from the admin catalog response', () => {
    assert.match(app, /openOrderStoreEditor\(draw,null,cats\)/);
    assert.match(app, /function openOrderStoreEditor\(refresh:.*categories:any\[\]=\[\]/);
    assert.match(app, /return flat\(categories\)\.map/);
    assert.ok(!/return flat\(state\.cats\|\|\[\]\)\.map/.test(app));
});
test('v2.71 catalog category image URLs render as thumbnails, not raw API paths', () => {
    assert.match(app, /admin-catalog-icon-image/);
    assert.match(css, /\.admin-catalog-icon-image/);
});
test('v2.71 admin back navigation returns through tabs before asking to exit', () => {
    assert.match(app, /__khadamatBackHandler/);
    assert.match(app, /adminTabHistory\.pop\(\)/);
});
test('v2.71 toasts occupy the available screen width and stay readable', () => {
    assert.match(css, /#liveToasts>div\{width:100%!important;max-width:none!important/);
});
test('v2.71 integration: a customer can order a service created inside a new category with a boolean field', async () => {
    const t = await startApp();
    try {
        const adminToken = await loginAdmin(t.api);
        const suffix = Date.now().toString(36);
        const categoryResponse = await t.api('POST', '/api/v1/admin/categories', { token: adminToken, body: { slug: `software-${suffix}`, name: { ar: 'برمجيات تجريبية', en: 'Test software' }, defaultPricingType: 'QUOTE' } });
        assert.equal(categoryResponse.status, 201, categoryResponse.text);
        const serviceResponse = await t.api('POST', '/api/v1/admin/services', { token: adminToken, body: { categoryId: categoryResponse.body.category.id, slug: `software-help-${suffix}`, name: { ar: 'مساعدة برمجية', en: 'Software help' }, pricingType: 'QUOTE', formSchema: [{ key: 'needs_license', type: 'boolean', label: { ar: 'هل تحتاج إلى ترخيص؟', en: 'Need a license?' }, required: true }] } });
        assert.equal(serviceResponse.status, 201, serviceResponse.text);
        const customer = await registerUser(t.api);
        const order = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: serviceResponse.body.service.id, description: 'أحتاج مساعدة برمجية', contactPhone: customer.creds.phone, formData: { needs_license: true } } });
        assert.equal(order.status, 201, order.text);
        assert.equal(order.body.order.formData.needs_license, true);
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_71_admin_catalog_and_order_form.test.js.map