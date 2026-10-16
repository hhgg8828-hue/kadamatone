import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('v2.78: all categories remains a modal with a persistent two-column grid/list toggle', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(app, /document\.getElementById\('allCategoriesBtn'\)\?\.addEventListener\('click',openAllCategories\)/);
  assert.match(app, /showModal\(render\(\)\)/);
  assert.match(app, /data-all-category=/);
  assert.match(app, /allCategoriesShowAll/);
  assert.match(app, /khadamat\.home\.categoriesView\.v1/);
  assert.match(css, /\.all-categories-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /all-categories-grid\.category-view-list/);
});
