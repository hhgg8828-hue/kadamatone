import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('V2.27 customer homepage follows the reference sequence while retaining the unique quick-access box', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const ticker = app.indexOf('class="khadamat-news-ticker"');
    const offers = app.indexOf('<section class="customer-offers"');
    const categories = app.indexOf('customer-category-showcase customer-category-showcase-top');
    const serviceBrowser = app.indexOf('class="customer-service-browser"');
    assert.ok(app.includes('id="quickAssistForm"'));
    assert.ok(ticker > 0 && offers > ticker && categories > offers && serviceBrowser > categories);
    assert.ok(app.includes('id="allOffersBtn"'));
    assert.ok(app.includes('id="allCategoriesBtn"'));
});
test('V2.27 service browser supports all/popular/new/favorite filters and favorites persist locally', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    for (const key of ['all', 'popular', 'new', 'favorite'])
        assert.ok(app.includes(`data-service-filter="${key}"`));
    assert.ok(app.includes('khadamat.favoriteServices.v1'));
    assert.ok(app.includes('data-catalog-open'));
    assert.ok(css.includes('.customer-catalog-card'));
    assert.ok(css.includes('.customer-service-filters button.active'));
});
test('V2.27 keeps the existing confirmation flow and changes the primary order action to the requested wording', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('id="submitOrderBtn" type="submit">تنفيذ الطلب</button>'));
    assert.ok(app.includes("review.id='orderConfirmationStep'"));
    assert.ok(app.includes('name="reviewOrderTime" value="now" checked'));
    assert.ok(app.includes('name="reviewOrderTime" value="later"'));
    assert.ok(app.includes('button type="button" class="btn" id="reviewConfirmOrder">تأكيد الطلب</button>'));
    assert.ok(app.includes('id="trackCreatedOrder" type="button">متابعة الطلب</button>'));
});
test('V2.27 asset versions and service worker cache stay aligned', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.27'), file);
        assert.ok(html.includes('app.css?v=2.27'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-27'));
});
//# sourceMappingURL=v2_27_reference_home.test.js.map