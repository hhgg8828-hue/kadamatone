import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('2.88: provider capability/skill selector has readable light and dark theme contrast', () => {
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.match(app, /id="capabilityEditor"/);
    assert.match(app, /data-capability=/);
    for (const selector of [
        ':root\\[data-theme="dark"\\] #providerCapabilitiesCard \\.capability-dropdown',
        ':root\\[data-theme="dark"\\] #providerCapabilitiesCard \\.capability-options label',
        ':root\\[data-theme="dark"\\] #providerCapabilitiesCard \\.selected-capabilities \\.status'
    ])
        assert.match(css, new RegExp(selector));
    assert.match(css, /:root\[data-theme="dark"\] #providerCapabilitiesCard \.capability-options label\{background:#22334b!important;color:#eef4fc!important/);
    assert.match(css, /:root\[data-theme="dark"\] #providerCapabilitiesCard \.capability-dropdown\{background:#172438!important;color:#eef4fc!important/);
});
//# sourceMappingURL=v2_88_provider_capability_contrast.test.js.map