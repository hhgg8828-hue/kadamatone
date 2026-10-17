import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('v2.76: customer filters persist and match favorite/new/nearby behavior', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /khadamat\.home\.serviceFilter\.v1/);
  assert.match(app, /evaluateServiceFilter\(filterServices,key/);
  assert.ok(!/newServiceWindowMs/.test(app));
  assert.match(app, /providers\/nearby\?serviceId=/);
  assert.match(app, /khadamat\.home\.selectedCategory\.v1/);
  assert.match(app, /startCustomerCatalogPolling/);
  assert.match(app, /,10000\)/);
  assert.match(app, /document\.getElementById\('allCategoriesBtn'\)\?\.addEventListener\('click',openAllCategories\)/);
});

test('v2.76: checkout uses actual catalog categories and dark theme fixes white invoice surfaces', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(app, /const loadManagedStores=async\(\)=>/);
  assert.match(app, /api\('\/order-stores'\)/);
  assert.match(app, /checkout-recommended-store-card/);
  assert.ok(!/const catalogCategories=flattenForCheckout/.test(app));
  assert.match(css, /:root\[data-theme="dark"\] \.modern-order-service-summary/);
  assert.match(css, /:root\[data-theme="dark"\] \.checkout-reference-invoice \.order-details-table td/);
  assert.match(css, /customer-category-scroll/);
});
