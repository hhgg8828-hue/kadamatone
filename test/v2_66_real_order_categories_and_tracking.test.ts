import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
const migration = readFileSync('src/db/migrations/039_remove_demo_order_store_seeds.sql', 'utf8');
test('V2.66: متاجر الطلب تختار التصنيفات الحقيقية من كتالوج الإدارة', () => {
  assert.ok(app.includes('القسم الحقيقي من كتالوج خدمات'));
  assert.ok(app.includes('const selected=catalogCategories'));
  assert.ok(!app.includes("api('/order-stores')"));
  assert.ok(app.includes("openCategory(slug)"));
  assert.ok(!app.includes('<option>بقالات</option><option>صيدليات</option>'));
  assert.ok(migration.includes('DELETE FROM order_store_recommendations'));
});
test('V2.66: اقتراحات الخدمات غير مكررة وزر عرض الكل ثابت بجانب الشريط', () => {
  assert.ok(app.includes('checkoutRelatedServices'));
  assert.ok(!app.includes('checkoutStoreProducts'));
  assert.ok(!app.includes('checkoutExtraServices'));
  assert.ok(app.includes('checkout-all-stores-fixed'));
  assert.ok(css.includes('.checkout-store-rail-layout'));
});
test('V2.66: تتبع الطلب يعرض الرقم ويستخدم ألوان الثيم للمنتجات والنصوص', () => {
  assert.ok(css.includes('.customer-order-tracking.reference-tracking .tracking-reference-header .tracking-reference-code-row h2 bdi'));
  assert.ok(css.includes('var(--theme-surface,var(--surface,#fff))'));
  assert.ok(css.includes(':root[data-theme="dark"] .customer-order-tracking.reference-tracking'));
  assert.ok(css.includes(':root[data-theme="light"] .customer-order-tracking.reference-tracking'));
});
