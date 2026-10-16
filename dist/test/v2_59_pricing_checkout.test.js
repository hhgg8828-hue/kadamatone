import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const catalog = readFileSync('src/modules/catalog.ts', 'utf8');
const orders = readFileSync('src/modules/orders.ts', 'utf8');
const migration = readFileSync('src/db/migrations/040_service_category_price_inheritance.sql', 'utf8');
test('category default fixed price is exposed when a service has no individual price', () => {
    assert.match(catalog, /x\.pricing_type === 'FIXED' && \(x\.uses_category_default === 1/);
    assert.match(migration, /uses_category_default INTEGER NOT NULL DEFAULT 0/);
    assert.match(orders, /const effectiveUnitPrice = svc\.pricing_type === 'FIXED' && \(svc\.uses_category_default === 1/);
    assert.match(orders, /Number\(effectiveUnitPrice\) \* quantityForPrice\(fields, formData\)/);
});
test('fixed-price order is rejected on server when no effective price exists', () => {
    assert.match(orders, /SERVICE_PRICE_UNAVAILABLE/);
    assert.match(orders, /سعر هذه الخدمة غير محدد حاليًا/);
});
test('category editor can manage category-level pricing', () => {
    assert.match(app, /name="defaultPricingType"/);
    assert.match(app, /name="defaultBasePrice"/);
    assert.match(app, /defaultPricingType:String\(f\.get\('defaultPricingType'\)/);
});
test('checkout suggestions are real categories and active services, without hardcoded store fee', () => {
    assert.match(app, /يمكنك أيضًا الطلب من التصنيفات التالية/);
    assert.match(app, /قد تعجبك هذه الخدمات أيضًا/);
    assert.match(app, /data-checkout-extra/);
    assert.equal(/رسوم توصيل منخفضة قدرها<\/b><strong>250 ر\.ي/.test(app), false);
});
//# sourceMappingURL=v2_59_pricing_checkout.test.js.map