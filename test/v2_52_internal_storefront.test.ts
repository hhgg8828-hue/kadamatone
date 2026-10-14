import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
test('internal storefront recommendations use same category only', () => {
  assert.match(app, /same-store-recommendations/);
  assert.match(app, /String\(x\.categoryId\)===String\(sv\.categoryId\)/);
  assert.match(app, /data-same-store-service/);
});
test('view all opens the existing category page', () => {
  assert.match(app, /sameStoreViewAll[\s\S]*?openCategory\(categorySlug\)/);
});
test('recommendations are horizontally scrollable and RTL', () => {
  assert.match(css, /same-store-recommendations-track[\s\S]*?overflow-x:auto/);
  assert.match(css, /direction:rtl/);
});
