import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const catalog = readFileSync('src/modules/catalog.ts', 'utf8');
test('فلاتر الخدمات تستبدل النتائج ولا تعرض خدمات غير مفضلة في فلتر المفضلة', () => {
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /لم تضف خدمات إلى المفضلة بعد/);
    assert.match(app, /saveServiceFavorites\(next\)/);
});
test('المفضلة محفوظة بمفتاح منفصل لكل مستخدم', () => {
    assert.match(app, /khadamat\.favoriteServices\.v1:\$\{state\.user\?\.id\|\|'guest'\}/);
});
test('فلتر الأقرب يتطلب إحداثيات صالحة ولا يصنف الخدمات بلا إحداثيات كقريبة', () => {
    assert.match(app, /validCoordinates\(sv\?\.latitude\?\?sv\?\.lat\?\?sv\?\.location\?\.lat/);
    assert.match(app, /locationAvailable:!!loc/);
    assert.match(app, /لا تتوفر إحداثيات فعلية كافية لترتيب الخدمات حسب القرب/);
});
test('فلتر الأحدث يعتمد على تاريخ إنشاء حقيقي مرسل من الخادم', () => {
    assert.match(catalog, /createdAt:\s*\(x as any\)\.created_at/);
    assert.match(app, /data-service-created=.*sv\.createdAt.*sv\.created_at/);
    assert.ok(!/newServiceWindowMs/.test(app));
    assert.match(readFileSync('public/service-filter-logic.js', 'utf8'), /return date !== null/);
});
//# sourceMappingURL=v2_63_service_filters.test.js.map