import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrackingProductLines } from '../public/service-filter-logic.js';
const css = readFileSync('public/css/app.css', 'utf8');
test('2.87: provider service/skill selection cards and text remain readable in dark mode', () => {
    assert.match(css, /:root\[data-theme="dark"\] \.provider-shell #servicesEditor \.service-check/);
    assert.match(css, /#1b2a40!important/);
    assert.match(css, /#eef4fc!important/);
    assert.match(css, /accent-color:#70d6a8/);
});
test('2.87: primary quantity survives tracking when extra services are included', () => {
    const rows = parseTrackingProductLines('الموقع: إب\n1. غسل سيارة متنقل — الكمية: 1 — سعر الوحدة 2500 ر.ي', 'عامل بناء', { worker_count: 3, primaryUnitPriceSnapshot: 10000, additionalServices: [{ name: 'غسل سيارة متنقل', quantity: 1, unitPrice: 2500 }] }, 32500);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'عامل بناء');
    assert.equal(rows[0].quantity, 3);
    assert.equal(rows[0].unitPrice, 10000);
    assert.equal(rows[0].lineTotal, 30000);
    assert.equal(rows[1].name, 'غسل سيارة متنقل');
    assert.equal(rows[1].quantity, 1);
    assert.equal(rows[1].unitPrice, 2500);
    assert.equal(rows[1].lineTotal, 2500);
});
//# sourceMappingURL=v2_87_provider_skills_quantity.test.js.map