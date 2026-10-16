import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const app = fs.readFileSync('public/app.ts', 'utf8');
test('v2.80: all filter shows the full home service catalog and removes stale category narrowing', () => {
    assert.match(app, /localStorage\.removeItem\('khadamat\.home\.selectedCategory\.v1'\)/);
    assert.match(app, /const filterMatch=key==='all'\|\|/);
    assert.match(app, /const show=filterMatch/);
});
test('v2.80: nearby filter only shows services with a real finite distance and sorts nearest first', () => {
    assert.match(app, /key==='nearby'&&Number\.isFinite\(d\)/);
    assert.match(app, /if\(key==='nearby'\)ranked\.sort\(\(a,b\)=>a\.d-b\.d/);
    assert.match(app, /providers\/nearby\?serviceId=/);
    assert.match(app, /لا تتوفر إحداثيات فعلية كافية لترتيب الخدمات حسب القرب/);
});
test('v2.80: new means created within the last 14 days; edits to old services do not make them new', () => {
    assert.match(app, /const newServiceWindowMs=14\*24\*60\*60\*1000/);
    assert.match(app, /now-created\)<=newServiceWindowMs/);
    assert.match(app, /sv\.createdAt\|\|sv\.created_at\|\|''/);
    assert.ok(!/data-service-created="\$\{esc\(sv\.createdAt\|\|sv\.created_at\|\|sv\.updatedAt/.test(app));
});
test('v2.80: favorites filter is strict and empty state explains how to add favorites', () => {
    assert.match(app, /key==='favorite'&&fav\.has\(id\)/);
    assert.match(app, /لم تضف خدمات إلى المفضلة بعد/);
    assert.match(app, /saveServiceFavorites\(next\)/);
});
//# sourceMappingURL=v2_80_service_filters.test.js.map