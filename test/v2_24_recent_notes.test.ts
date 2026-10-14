import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.28 follows the reference browsing order: ticker, banner, categories, quick access, offers', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const ticker = app.indexOf('class="khadamat-news-ticker reference-news-ticker"');
  const banner = app.indexOf('class="customer-promo-banner"');
  const categories = app.indexOf('customer-category-showcase customer-category-showcase-top');
  const quick = app.indexOf('class="quick-assist-reference"');
  const offers = app.indexOf('<section class="customer-offers"');
  assert.ok(ticker >= 0 && banner > ticker && categories > banner && quick > categories && offers > quick);
  assert.ok(app.includes('id="allCategoriesBtn"'));
  assert.ok(app.includes('id="allOffersBtn"'));
  assert.ok(app.includes('data-all-offer'));
});

test('2.24 order confirmation supports now/later scheduling and a concise note preview', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('name="reviewOrderTime" value="now" checked'));
  assert.ok(app.includes('name="reviewOrderTime" value="later"'));
  assert.ok(app.includes('id="reviewScheduledAt"'));
  assert.ok(app.includes('const scheduledAt=confirmedScheduledAt'));
  assert.ok(app.includes('لا توجد ملاحظة'));
  assert.ok(app.includes('id="reviewChangeAddress"'));
});

test('2.24 campaign category actions are accepted by create/update API and saving is guarded against double submit', () => {
  const api = fs.readFileSync('src/modules/admin.operations.ts', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.equal((api.match(/'CATEGORY'/g) || []).length >= 2, true);
  assert.ok(app.includes('value="CATEGORY"'));
  assert.ok(app.includes('let campaignSaving=false'));
  assert.ok(app.includes('let temporarySaving=false'));
});

test('2.24 assets use a new cache version and back navigation asks before leaving', () => {
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(sw.includes('khadamat-shell-v2-29'));
  assert.ok(app.includes('هل ترغب في الخروج؟'));
});
