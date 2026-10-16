import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('2.34 follows the latest browsing order: ticker, quick access, categories, offers, services', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const ticker = app.indexOf('class="khadamat-news-ticker reference-news-ticker"');
    const categories = app.indexOf('customer-category-showcase customer-category-showcase-top');
    const quick = app.indexOf('class="quick-assist-reference"');
    const offers = app.indexOf('<section class="customer-offers"');
    const services = app.indexOf('class="reference-service-section"');
    assert.ok(ticker >= 0 && quick > ticker && categories > quick && offers > categories && services > offers);
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
    assert.ok(app.includes('id="reviewAddressEditor"'));
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
    assert.ok(sw.match(/khadamat-shell-v\d+-\d+/));
    assert.ok(app.includes('هل أنت متأكد أنك تريد الخروج من تطبيق خدمات؟'));
});
//# sourceMappingURL=v2_24_recent_notes.test.js.map