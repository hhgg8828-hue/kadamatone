import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('public/app.ts', 'utf8');
const orders = readFileSync('src/modules/orders.ts', 'utf8');

test('quantity field detection includes passenger and worker fields', () => {
  assert.match(app, /passengers/);
  assert.match(app, /عدد الركاب/);
  assert.match(app, /عدد العمال/);
});

test('confirmation invoice and summaries multiply unit price by selected quantity', () => {
  assert.match(app, /selectedQuantity/);
  assert.match(app, /pricedSubtotal/);
  assert.match(app, /checkoutGrandTotal/);
});

test('server stores fixed-price snapshot multiplied by validated quantity', () => {
  assert.match(orders, /function quantityForPrice/);
  assert.match(orders, /Number\(svc\.base_price\) \* quantityForPrice\(fields, formData\)/);
});
