import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('2.15.0 keeps compact single-box quick access and places the ticker below it in source and bundle', () => {
    const ts = fs.readFileSync('public/app.ts', 'utf8');
    const js = fs.readFileSync('public/js/app.js', 'utf8');
    for (const source of [ts, js]) {
        assert.ok(source.includes('id="quickAssistForm"'), 'quick access form must be present');
        assert.ok(source.includes('id="quickAssistText"'), 'one compact request box must be present');
        assert.ok(source.includes('id="quickAssistVoice"'), 'talk button must be present');
        assert.ok(!source.includes('simpleRequestForm'), 'large three-step request form must not return');
        assert.ok(!source.includes('simpleRequestImage'), 'image upload must not be part of quick access');
        assert.ok(!source.includes('service-orbit'), 'decorative service orbit must not be above quick access');
        assert.ok(source.indexOf('id=\"quickAssistForm\"') < source.indexOf('khadamat-news-ticker'), 'ticker must appear after the compact quick access form');
        assert.ok(source.indexOf('khadamat-news-ticker') < source.indexOf('promo-square-grid'), 'ticker must precede the square promotional cards');
    }
    assert.ok(ts.includes('setupQuickAssistComposer()'), 'compact intent-search composer must be wired');
    assert.ok(!ts.includes('setupSimpleRequestComposer'), 'three-step composer must be removed from source');
});
test('2.15.0 keeps hierarchical customer region selection and GPS location control', () => {
    const ts = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(ts.includes('المحافظة / المنطقة / الحي'), 'hierarchical region label must be restored');
    assert.ok(ts.includes('areaPath(a)'), 'full administrative area path must be shown');
    assert.ok(ts.includes('id="customerUseLocation"'), 'customer location button must be present');
    assert.ok(ts.includes('khadamat.currentLocation.v1'), 'guest GPS selection must be retained');
});
//# sourceMappingURL=v2_13_3_compact_quick_access.test.js.map