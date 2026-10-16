import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
test('اختيار التصنيف يطابق الخدمات الموجودة فعليًا داخل التصنيف وفروعه', () => {
    assert.match(app, /categoryServiceIds=new Set<string>\(\)/);
    assert.match(app, /Array\.isArray\(c\.services\)\?c\.services:\[\]/);
    assert.match(app, /categoryServiceIds\.has\(id\)/);
    assert.match(app, /collectCategory\(c\.children,included\)/);
});
test('تظل فلاتر الكل والأقرب والجديدة والمفضلة متقاطعة مع التصنيف المحدد', () => {
    assert.match(app, /const show=categoryMatch&&filterMatch/);
    assert.match(app, /key==='favorite'&&fav\.has\(id\)/);
    assert.match(app, /key==='new'&&isNew/);
    assert.match(app, /key==='nearby'&&Number\.isFinite\(d\)/);
});
test('زر كل التصنيفات يلغي التحديد ويعيد تطبيق الفلتر الحالي على كل الخدمات', () => {
    assert.match(app, /applyHomeCategory\(''\)/);
    assert.match(app, /applyServiceFilter\(activeHomeServiceFilter\)/);
});
//# sourceMappingURL=v2_77_category_filter.test.js.map