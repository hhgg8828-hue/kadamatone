import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
const catalog = readFileSync('src/modules/catalog.ts', 'utf8');
test('nearby services require valid customer and service coordinates and sort by distance', () => {
    assert.match(app, /function validCoordinates\(latValue:any,lngValue:any\)/);
    assert.match(app, /if\(!loc\)return Infinity/);
    assert.match(app, /providers\/nearby\?serviceId=/);
    assert.match(app, /nearbyServiceDistanceCache/);
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /rankIndex\.get\(id\)/);
    assert.match(app, /لا تتوفر إحداثيات فعلية كافية لترتيب الخدمات حسب القرب/);
});
test('new service and campaign filters do not invent freshness when timestamps are missing', () => {
    assert.ok(!/newServiceWindowMs/.test(app));
    assert.match(readFileSync('public/service-filter-logic.js', 'utf8'), /return date !== null/);
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
test('trip locations are chosen from saved locations and every map pin is saved for reuse', () => {
    assert.match(app, /data-tt-saved/);
    assert.match(app, /api\('\/me\/addresses',\{method:'POST'/);
    assert.match(app, /من العناوين المحفوظة/);
});
test('theme and interaction polish is present for dark-mode placeholders and filters', () => {
    assert.match(css, /:root\[data-theme="dark"\] input::placeholder/);
    assert.match(css, /customer-service-filters button\{font-size:15px/);
});
//# sourceMappingURL=v2_58_followup_notes.test.js.map