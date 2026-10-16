import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const html = fs.readFileSync('public/customer.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
test('V2.34 selected area includes a location pin and bilingual area name', () => {
    assert.ok(app.includes('function areaNameEnglish(area:any)'));
    assert.ok(app.includes("'إب':'Ibb'"));
    assert.ok(app.includes("'صنعاء':'Sana’a'"));
    assert.ok(app.includes('class=\\"customer-area-label\\"'));
    assert.ok(app.includes('customerAreaMarkup()'));
    assert.ok(css.includes('.customer-shell .customer-area-label>svg'));
    assert.ok(css.includes('.customer-shell .customer-area-names i'));
});
test('V2.34 offers carousel spans the available width and all-offers button is transparent overlay', () => {
    assert.ok(app.includes('اكتشف الخدمات المتاحة في منطقتك'));
    assert.ok(css.includes('.customer-shell .campaign-strip-wrap{position:relative;padding:0!important'));
    assert.ok(css.includes('background:rgba(255,255,255,.22)!important;color:#176b4d!important'));
    assert.ok(css.includes('.customer-shell .customer-empty-banner{width:calc(100% + 24px)'));
    assert.ok(css.includes('margin:0 -12px'));
});
test('V2.34 customer cache and asset URLs are version-aligned', () => {
    assert.ok(html.includes('app.js?v=2.38'));
    assert.ok(html.includes('app.css?v=2.38'));
    assert.ok(sw.includes('khadamat-shell-v2-38'));
});
//# sourceMappingURL=v2_30_customer_area_offers.test.js.map