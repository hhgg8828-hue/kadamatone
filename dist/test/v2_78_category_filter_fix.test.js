import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('v2.78: all categories remains a modal and category selection filters the service list', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.match(app, /document\.getElementById\('allCategoriesBtn'\)\?\.addEventListener\('click',openAllCategories\)/);
    assert.match(app, /showModal\(render\(\)\)/);
    assert.match(app, /closeModal\(\);applyHomeCategory\(slug\)/);
    assert.match(app, /categoryMatch&&filterMatch/);
    assert.match(app, /khadamat\.home\.selectedCategory\.v1/);
    assert.match(app, /categorySlugs\.has\(normalizeCategory\(serviceCategorySlug\)\)/);
    assert.match(app, /allCategoriesShowAll/);
});
//# sourceMappingURL=v2_78_category_filter_fix.test.js.map