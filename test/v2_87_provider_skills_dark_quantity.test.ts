import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTrackingProductLines } from '../public/service-filter-logic.js';

test('2.87: provider skills/capability dropdown has readable dark-mode surfaces and text', () => {
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  for (const selector of [
    '.provider-shell .capability-dropdown',
    '.provider-shell .capability-dropdown summary',
    '.provider-shell .capability-options label',
    '.provider-shell .selected-capabilities .status',
  ]) assert.ok(css.includes(selector), `missing dark theme rule for ${selector}`);
  assert.match(css, /capability-options label\s*\{[^}]*background:#22334b!important;[^}]*color:#eef4fc!important/s);
  assert.match(css, /capability-options label span\s*\{[^}]*color:#eef4fc!important/s);
});

test('2.87: tracking keeps primary quantity and price independent from an additional service', () => {
  const description = 'عامل بناء — الكمية: 3\nالخدمات الإضافية ضمن الطلب:\n1. غسل سيارة متنقل — الكمية: 1 — سعر الوحدة 5000 ر.ي';
  const rows = parseTrackingProductLines(description, 'عامل بناء', {
    quantity: 3,
    primaryUnitPriceSnapshot: 10000,
    additionalServices: [{ name: 'غسل سيارة متنقل', quantity: 1, unitPrice: 5000 }],
  }, 35000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'عامل بناء');
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].unitPrice, 10000);
  assert.equal(rows[0].lineTotal, 30000);
  assert.equal(rows[1].name, 'غسل سيارة متنقل');
  assert.equal(rows[1].quantity, 1);
  assert.equal(rows[1].unitPrice, 5000);
  assert.equal(rows[1].lineTotal, 5000);
});
