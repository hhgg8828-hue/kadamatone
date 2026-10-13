import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Campaigns can represent a category containing multiple services', () => {
  const api = fs.readFileSync('src/modules/admin.operations.ts', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(api.includes("'TRIP','CATEGORY','INTERNAL'"));
  assert.ok(app.includes('فئة تضم عدة خدمات'));
  assert.ok(app.includes("if(t==='CATEGORY'&&v)openCampaignCategories(c)"));
  assert.ok(app.includes("categorySlugs:String(f.get('actionType'))==='CATEGORY'"));
});

test('Tapping a category offer image or CTA opens its service category directly', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes("if(v&&t==='CATEGORY')openCampaignCategories(c)"), 'clicking a category offer image opens its service list directly');
  assert.ok(app.includes("if(t==='CATEGORY'&&v){const cardCampaign=state.campaigns.find((c:any)=>c.id===(z as HTMLElement).closest('[data-campaign-card]')?.getAttribute('data-campaign-card'));openCampaignCategories(cardCampaign||{actionValue:v});return;}"), 'the offer CTA opens the linked category directly');
  assert.ok(app.includes('id="campaignDetailAction"'), 'non-category offers retain their details action');
});

test('Offer imagery is compact and release asset cache versions match V2.23', () => {
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.ok(css.includes('.customer-shell .campaign-card .campaign-image{aspect-ratio:16/9;object-fit:cover}') || css.includes('.customer-shell .campaign-card .campaign-image{height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:10px;grid-row:auto}'));
  for (const file of ['public/index.html','public/customer.html','public/provider.html','public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes('app.js?v=2.27'), file);
    assert.ok(html.includes('app.css?v=2.27'), file);
  }
  assert.ok(fs.readFileSync('public/sw.js','utf8').includes('khadamat-shell-v2-27'));
});

test('Customer home follows the reference order: news ticker, offers, then categories', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const tickerAt = app.indexOf('class="khadamat-news-ticker"');
  const offersAt = app.indexOf('<section class="customer-offers"');
  const categoryAt = app.indexOf('customer-category-showcase customer-category-showcase-top');
  assert.ok(tickerAt >= 0 && offersAt > tickerAt, 'news ticker must precede offers');
  assert.ok(categoryAt > offersAt, 'categories must follow offers');
  assert.ok(app.includes('id="allCategoriesBtn"'));
  assert.ok(app.includes('id="allOffersBtn"'));
  assert.ok(app.includes('customer-city-select card customer-city-select-compact'));
  assert.ok(fs.readFileSync('public/css/app.css', 'utf8').includes('.customer-shell > .customer-city-select-compact small{display:none}'));
});
