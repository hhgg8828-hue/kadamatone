import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
const catalog = readFileSync('src/modules/catalog.ts', 'utf8');
test('nearby services require valid customer and service coordinates and sort by distance', () => {
    assert.match(app, /key==='nearby'&&hasLoc&&Number\.isFinite\(d\)/);
    assert.match(app, /cards\.sort\(\(a,b\)=>Number\(a\.dataset\.distanceKm\?\?Infinity\)-Number\(b\.dataset\.distanceKm\?\?Infinity\)\)/);
    assert.match(app, /لا تتوفر إحداثيات موثوقة للخدمات القريبة حاليًا/);
});
test('new service and campaign filters do not invent freshness when timestamps are missing', () => {
    assert.match(app, /key==='new'&&isNew/);
    assert.ok(!/isNew\|\|\(!Number\.isFinite\(created\)&&i<2\)/.test(app));
});
test('temporary service ticker uses currently active services and opens its action', () => {
    assert.match(catalog, /start_at<=\? AND end_at>\?/);
    assert.match(app, /activeTemporaryService/);
    assert.match(app, /data-temp-id/);
});
test('temporary service editor validates finite dates and requires end after start before save', () => {
    assert.match(app, /!Number\.isFinite\(startMs\)\|\|!Number\.isFinite\(endMs\)\|\|endMs<=startMs/);
    assert.match(app, /تحقق من تاريخ البداية والنهاية؛ يجب أن تكون النهاية بعد البداية/);
});
test('recent trip locations are stored locally and offered in the origin/destination chooser', () => {
    assert.match(app, /khadamat\.locationHistory\.v1/);
    assert.match(app, /data-trip-recent/);
    assert.match(app, /موقع استخدمته سابقًا/);
});
test('theme and interaction polish is present for dark-mode placeholders and filters', () => {
    assert.match(css, /:root\[data-theme="dark"\] input::placeholder/);
    assert.match(css, /customer-service-filters button\{font-size:15px/);
});
//# sourceMappingURL=v2_58_followup_notes.test.js.map