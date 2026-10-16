import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('V2.28 customer homepage follows the supplied reference sequence and preserves Khadamat quick access', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const ticker = app.indexOf('class="khadamat-news-ticker reference-news-ticker"');
    const categories = app.indexOf('customer-category-showcase customer-category-showcase-top');
    const quick = app.indexOf('class="quick-assist-reference"');
    const offers = app.indexOf('<section class="customer-offers"');
    const services = app.indexOf('class="reference-service-section"');
    assert.ok(ticker > 0 && quick > ticker && categories > quick && offers > categories && services > offers);
    assert.ok(app.includes('id="quickAssistForm"'));
    assert.ok(app.includes('id="allOffersBtn"'));
    assert.ok(app.includes('id="allCategoriesBtn"'));
    assert.ok(app.includes('id="customerAreaToggle"'));
});
test('V2.28 service list uses a vertical layout with working filters and local favorites', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    for (const key of ['all', 'nearby', 'new', 'favorite'])
        assert.ok(app.includes(`data-service-filter="${key}"`));
    assert.ok(app.includes('khadamat.favoriteServices.v1'));
    assert.ok(app.includes('data-service-card='));
    assert.ok(css.includes('.customer-service-row'));
    assert.ok(css.includes('.customer-service-filters button.active'));
});
test('V2.28 bottom navigation opens home, orders, subscriptions, and account', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    for (const key of ['home', 'orders', 'subscriptions', 'account'])
        assert.ok(app.includes(`data-customer-nav="${key}"`));
    assert.ok(app.includes('function openCustomerSubscriptions()'));
    assert.ok(app.includes('function openCustomerAreaPicker()'));
});
test('V2.28 keeps the concise order confirmation and executes only after confirmation', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('id="submitOrderBtn" type="submit">متابعة</button>'));
    assert.ok(app.includes("review.id='orderConfirmationStep'"));
    assert.ok(app.includes('هل لديك قسيمة تخفيض؟'));
    assert.ok(app.includes('name="reviewOrderTime" value="now" checked'));
    assert.ok(app.includes('name="reviewOrderTime" value="later"'));
    assert.ok(app.includes('id="reviewConfirmOrder">تنفيذ الطلب</button>'));
    assert.ok(app.includes('id="trackCreatedOrder" type="button">متابعة الطلب</button>'));
    assert.ok(!app.includes('الموقع الذي سيتم تحديده هو'));
});
test('V2.28 asset versions and service worker cache stay aligned', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.63'), file);
        assert.ok(html.includes('app.css?v=2.63'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-63'));
});
test('V2.28 account menu mirrors the reference account screen and routes each main section', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('class="customer-account-home"'));
    assert.ok(app.includes('المنطقة الحالية'));
    for (const key of ['profile', 'orders', 'subscriptions', 'balance', 'addresses', 'city', 'contact', 'privacy', 'share', 'howto', 'appearance', 'suggestions', 'advanced', 'logout', 'delete']) {
        assert.ok(app.includes(`'${key}'`), `missing account destination ${key}`);
    }
    assert.ok(app.includes('data-account-page="${key}"'));
    assert.ok(app.includes('async function openAccountEditor()'));
    assert.ok(app.includes('function openCustomerSubscriptions()'));
});
//# sourceMappingURL=v2_28_reference_home.test.js.map