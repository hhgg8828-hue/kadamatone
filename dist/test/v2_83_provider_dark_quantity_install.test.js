import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('V2.83: service editor exposes a persisted per-service quantity toggle', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.match(app, /name="supportsQuantity"/);
    assert.match(app, /quantityToggle\?\.addEventListener\('change'/);
    assert.match(app, /formSchema\.unshift\(\{key:'quantity',type:'number'/);
    assert.match(app, /formSchema=formSchema\.filter\(\(x:any\)=>!isQtyField\(x\)\)/);
    assert.match(app, /formSchema:formSchema\.map/);
});
test('V2.83: provider dashboard cards and execution choices have dark-theme colors', () => {
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    for (const selector of ['.provider-quick-nav', '.provider-command-strip>div', '.service-editor-checks label', '.quantity-support-setting'])
        assert.match(css, new RegExp(':root\\[data-theme="dark"\\] ' + selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
    assert.match(css, /:root\[data-theme="dark"\] \.provider-command-strip b\{color:#eef4fc/);
});
test('V2.83: provider-only install guidance works when automatic install prompt is unavailable', () => {
    const html = fs.readFileSync('public/provider.html', 'utf8');
    const install = fs.readFileSync('public/js/install-app.js', 'utf8');
    const manifest = JSON.parse(fs.readFileSync('public/manifest-provider.webmanifest', 'utf8'));
    assert.match(html, /manifest-provider\.webmanifest/);
    assert.match(html, /KHADAMAT_APP=\{id:"provider"/);
    assert.equal(manifest.start_url, '/provider');
    assert.match(install, /if \(isProvider\)/);
    assert.match(install, /showInstallHelp/);
    assert.match(install, /إضافة إلى الشاشة الرئيسية/);
    assert.match(install, /beforeinstallprompt/);
});
//# sourceMappingURL=v2_83_provider_dark_quantity_install.test.js.map