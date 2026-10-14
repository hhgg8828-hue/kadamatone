import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
test('quick access prompt invites speaking or typing', () => {
    assert.ok(app.includes('تحدث أو اكتب ما تحتاجه وسنساعدك في الوصول إلى الخدمة.'));
});
test('campaign cards are image-first and do not render a text/description block', () => {
    assert.ok(app.includes('campaign-image-overlay-label'));
    assert.ok(!app.includes('<div class="campaign-card-copy"><b>${esc(c.title)}</b><p>${esc(c.description || \'\')}</p>'));
    assert.ok(app.includes('data-campaign-card="${esc(c.id)}" tabindex="0" role="button"'));
});
test('campaign cards use square images and a compact overlay label', () => {
    assert.match(css, /\.customer-shell \.campaign-card\{display:block;position:relative;flex:0 0 min\(47vw,190px\);width:min\(47vw,190px\);aspect-ratio:1\/1/);
    assert.match(css, /\.customer-shell \.campaign-card \.campaign-image\{display:block;width:100%;height:100%;aspect-ratio:1\/1;object-fit:cover/);
    assert.match(css, /\.customer-shell \.campaign-card-copy,\.customer-shell \.campaign-image-badge\{display:none!important\}/);
});
//# sourceMappingURL=v2_31_quick_access_image_first_offers.test.js.map