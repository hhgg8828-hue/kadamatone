import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('v2.79: choosing a category opens its services in a modal instead of filtering the home list', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    assert.match(app, /document\.querySelectorAll\('\[data-cat\]'\)\.forEach\(x=>x\.addEventListener\('click',\(\)=>openCategory/);
    assert.match(app, /closeModal\(\);void openCategory\(slug\)/);
    assert.match(app, /category-services-modal/);
    assert.match(app, /categoryServicesViewToggle/);
    assert.match(app, /khadamat\.home\.categoryServicesView\.v1/);
    assert.match(app, /category-view-list/);
    assert.match(css, /\.category-services-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /\.category-services-grid\.category-view-list\{grid-template-columns:minmax\(0,1fr\);gap:7px\}/);
    assert.match(css, /:root\[data-theme="dark"\] \.customer-shell \.category-services-grid \.category-service-choice/);
});
//# sourceMappingURL=v2_79_category_popup_views.test.js.map