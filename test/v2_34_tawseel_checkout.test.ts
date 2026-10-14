import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ts = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
test('checkout uses compact reference-like rows and removes the extra detail table', () => {
  assert.match(ts, /tawseel-checkout-row/);
  assert.match(ts, /عنوان التنفيذ/);
  assert.match(ts, /ملاحظات الطلب/);
  assert.match(ts, /تحديد وقت الطلب/);
  assert.match(ts, /الدفع عند الاستلام/);
  const section = ts.slice(ts.indexOf('review.innerHTML=`'), ts.indexOf('const originalChildren=Array.from(orderForm.children)'));
  assert.ok(!/order-details-table|رقم التواصل/.test(section));
  assert.match(css, /tawseel-checkout-row/);
});
test('schedule follows day, time, confirm and rejects past times', () => {
  assert.match(ts, /data-schedule-step-indicator="1">1 اليوم/);
  assert.match(ts, /data-schedule-step-indicator="2">2 الوقت/);
  assert.match(ts, /data-schedule-step-indicator="3">3 تأكيد الجدولة/);
  assert.match(ts, /candidate\.getTime\(\)<=Date\.now\(\)/);
});
test('only the supported cash-on-delivery method is shown', () => {
  const section = ts.slice(ts.indexOf('review.innerHTML=`'), ts.indexOf('const originalChildren=Array.from(orderForm.children)'));
  assert.match(section, /value="CASH" checked/);
  assert.ok(!/value="WALLET"|value="CARD"|محفظة إلكترونية/.test(section));
});
