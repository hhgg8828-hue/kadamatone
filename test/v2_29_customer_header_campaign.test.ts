import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const customerHtml = fs.readFileSync('public/customer.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

test('V2.29 customer header shows team phone beside notifications', () => {
  assert.ok(app.includes('customer-contact-top-btn'));
  assert.ok(app.includes('href="tel:+967778100022"'));
  assert.ok(app.includes('aria-label="التواصل مع فريق خدمات"'));
  assert.ok(app.includes('id="notificationsBtn"'));
  assert.ok(css.includes('.customer-shell .top-actions .customer-contact-top-btn,.customer-shell .top-actions .notification-top-btn'));
});

test('V2.29 selected area remains visible below Khadamat on narrow screens and can be changed', () => {
  assert.ok(app.includes("String((state.areas||[]).find((a:any)=>a.id===state.selectedAreaId)?.name||'اختر المنطقة')"));
  assert.ok(app.includes('id="customerAreaToggle"'));
  assert.ok(app.includes('function openCustomerAreaPicker()'));
  assert.ok(css.includes('.customer-shell .brand-lockup small{display:block!important'));
});

test('V2.29 promo is a slim ad/campaign button and opens the configured campaign', () => {
  assert.ok(app.includes('aria-label="الإعلانات والعروض المؤقتة"'));
  assert.ok(app.includes('class="customer-promo-label">إعلان</span>'));
  assert.ok(app.includes('data-promo-campaign'));
  assert.ok(app.includes("document.querySelectorAll('[data-promo-campaign]')"));
  assert.ok(css.includes('.customer-shell .customer-promo-item{display:flex;flex:0 0 100%'));
  assert.ok(css.includes('.customer-shell .customer-promo-placeholder{cursor:default'));
});

test('V2.29 customer assets and service-worker cache are version-aligned', () => {
  assert.ok(customerHtml.includes('app.js?v=2.29'));
  assert.ok(customerHtml.includes('app.css?v=2.29'));
  assert.ok(sw.includes('khadamat-shell-v2-29'));
});
