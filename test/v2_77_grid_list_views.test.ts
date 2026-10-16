import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('v2.77: service grid/list toggle persists and preserves existing service filters', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(app, /khadamat\.home\.servicesView\.v1/);
  assert.match(app, /customerServiceViewToggle/);
  assert.match(app, /service-view-grid/);
  assert.match(app, /data-service-filter="favorite"/);
  assert.match(css, /#customerServiceList\.service-view-grid/);
  assert.match(css, /customer-view-toggle/);
});

test('v2.77: all categories modal supports grid/list and applies actual category filtering', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(app, /khadamat\.home\.categoriesView\.v1/);
  assert.match(app, /data-all-category=/);
  assert.match(app, /allCategoriesShowAll/);
  assert.match(app, /applyHomeCategory\(slug\)/);
  assert.match(css, /all-categories-grid\.category-view-list/);
  assert.match(css, /:root\[data-theme="dark"\].*all-categories-grid/s);
});
