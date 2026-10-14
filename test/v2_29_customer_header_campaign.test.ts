import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const customerHtml = fs.readFileSync('public/customer.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

test('V2.34 customer header shows team phone beside notifications', () => {
  assert.ok(app.includes('customer-contact-top-btn'));
  assert.ok(app.includes('href="tel:+967778100022"'));
  assert.ok(app.includes('aria-label="التواصل مع فريق خدمات"'));
  assert.ok(app.includes('id="notificationsBtn"'));
  assert.ok(css.includes('.customer-shell .top-actions .customer-contact-top-btn,.customer-shell .top-actions .notification-top-btn'));
});

test('V2.34 selected area remains visible below Khadamat on narrow screens and can be changed', () => {
  assert.ok(app.includes("String((state.areas||[]).find((a:any)=>a.id===state.selectedAreaId)?.name||'اختر المنطقة')"));
  assert.ok(app.includes('id="customerAreaToggle"'));
  assert.ok(app.includes('function openCustomerAreaPicker()'));
  assert.ok(css.includes('.customer-shell .brand-lockup small{display:block!important'));
});

test('V2.34 removes the extra header promo control while retaining carousel campaign routing', () => {
  assert.ok(!app.includes('aria-label="الإعلانات والعروض المؤقتة"'));
  assert.ok(!app.includes('class="customer-promo-label">إعلان</span>'));
  assert.ok(app.includes('data-campaign-card'));
  assert.ok(app.includes("document.querySelectorAll('[data-campaign-card]')"));
  assert.ok(css.includes('.customer-shell .campaign-card'));
});

test('V2.34 customer assets and service-worker cache are version-aligned', () => {
  assert.ok(customerHtml.includes('app.js?v=2.34'));
  assert.ok(customerHtml.includes('app.css?v=2.34'));
  assert.ok(sw.includes('khadamat-shell-v2-34'));
});
