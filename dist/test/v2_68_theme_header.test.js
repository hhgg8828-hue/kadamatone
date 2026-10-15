import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync('public/js/app.js', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
test('v2.68: navy dark palette applies to all portals and dialogs', () => {
    assert.match(css, /--kh-navy-bg:#080f1c/);
    assert.match(css, /\.admin-page/);
    assert.match(css, /\.provider-shell/);
    assert.match(css, /\.modal-content/);
    assert.match(css, /\.quick-assist-reference/);
});
test('v2.68: header location menu supports saved addresses and city changes', () => {
    assert.match(js, /function openHeaderLocationMenu\(\)/);
    assert.match(js, /id="headerAddAddress"/);
    assert.match(js, /id="headerChangeCity"/);
    assert.match(js, /data-header-address/);
    assert.match(js, /function openCustomerContactMenu\(\)/);
    assert.match(js, /wa\.me\/967778100022/);
});
test('v2.68: header is sticky and bottom navigation hides on upward content scroll', () => {
    assert.match(css, /\.app-topbar\{position:sticky/);
    assert.match(css, /\.customer-bottom-nav\.nav-hidden/);
    assert.match(js, /nav\.classList\.toggle\('nav-hidden', delta > 0\)/);
});
test('v2.68: system theme updates browser status bar color', () => {
    assert.match(js, /meta\.setAttribute\('content', dark \? '#080f1c' : '#ffffff'\)/);
});
//# sourceMappingURL=v2_68_theme_header.test.js.map