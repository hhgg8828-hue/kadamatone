import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Campaigns can represent a category containing multiple services', () => {
  const api = fs.readFileSync('src/modules/admin.operations.ts', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(api.includes("'TRIP','CATEGORY','INTERNAL'"));
  assert.ok(app.includes('فئة تضم عدة خدمات'));
  assert.ok(app.includes("if(t==='CATEGORY'&&v)openCategory(v)"));
  assert.ok(app.includes("String(f.get('actionType'))==='CATEGORY'?String(f.get('categorySlug')||'')"));
});

test('Tapping a category offer CTA opens offer details before opening its service category', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes("if(t==='CATEGORY'){const card=z.closest('[data-campaign-card]')"));
  assert.ok(app.includes("if(t==='CATEGORY'&&v)openCategory(v)"));
  assert.ok(app.includes('id="campaignDetailAction"'));
});

test('Offer imagery is compact and release asset cache versions match V2.22', () => {
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.ok(css.includes('.customer-shell .campaign-card .campaign-image{aspect-ratio:16/9;object-fit:cover}'));
  for (const file of ['public/index.html','public/customer.html','public/provider.html','public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes('app.js?v=2.22'), file);
    assert.ok(html.includes('app.css?v=2.22'), file);
  }
  assert.ok(fs.readFileSync('public/sw.js','utf8').includes('khadamat-shell-v2-22'));
});

test('Customer home puts compact categories where the news ticker used to be, before offers', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const categoryAt = app.indexOf('const categoryMarkup=');
  const offersAt = app.indexOf('<section class="customer-offers"', categoryAt);
  const tickerAt = app.indexOf('class="khadamat-news-ticker"', offersAt);
  assert.ok(categoryAt >= 0 && offersAt > categoryAt, 'categories must be rendered before offers');
  assert.ok(tickerAt > offersAt, 'news ticker remains available below the offers');
  assert.ok(app.includes('customer-category-showcase customer-category-showcase-top'));
  assert.ok(app.includes('customer-city-select card customer-city-select-compact'));
  assert.ok(fs.readFileSync('public/css/app.css', 'utf8').includes('.customer-shell > .customer-city-select-compact small{display:none}'));
});
