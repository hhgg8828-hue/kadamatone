import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const app = fs.readFileSync('public/app.ts', 'utf8');
test('v2.80: all filter shows the full home service catalog and removes stale category narrowing', () => {
    assert.match(app, /localStorage\.removeItem\('khadamat\.home\.selectedCategory\.v1'\)/);
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /visibleIds\.has\(id\)/);
});
test('v2.80: nearby filter only shows services with a real finite distance and sorts nearest first', () => {
    assert.match(app, /locationAvailable:!!loc/);
    assert.match(app, /rankIndex\.get\(id\)/);
    assert.match(app, /providers\/nearby\?serviceId=/);
    assert.match(app, /لا تتوفر إحداثيات فعلية كافية لترتيب الخدمات حسب القرب/);
});
test('v2.82: new means created within the last 30 days; edits to old services do not make them new', () => {
    assert.match(app, /const newServiceWindowMs=30\*24\*60\*60\*1000/);
    assert.match(fs.readFileSync('public/service-filter-logic.js', 'utf8'), /now - date <= recentWindowMs/);
    assert.match(app, /sv\.createdAt\|\|sv\.created_at\|\|''/);
    assert.ok(!/data-service-created="\$\{esc\(sv\.createdAt\|\|sv\.created_at\|\|sv\.updatedAt/.test(app));
});
test('v2.80: favorites filter is strict and empty state explains how to add favorites', () => {
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /لم تضف خدمات إلى المفضلة بعد/);
    assert.match(app, /saveServiceFavorites\(next\)/);
});
//# sourceMappingURL=v2_80_service_filters.test.js.map