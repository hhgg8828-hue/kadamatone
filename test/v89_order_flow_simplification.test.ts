import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.26 modern order form shows only essential inputs and no generic old questionnaire', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const form = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
  assert.ok(form.includes('class="modern-order-form"'));
  assert.ok(form.includes('أدخل المعلومات الضرورية لهذه الخدمة فقط'));
  assert.ok(form.includes('عنوان تنفيذ الخدمة'));
  assert.ok(form.includes('name="contactPhone"'));
  assert.ok(!form.includes('تحديد منطقة أدق (اختياري)'));
  assert.ok(!form.includes('الطلب لشخص آخر؟'));
  assert.ok(!form.includes('هل تريد غسيل السيارة في موقعك الحالي أم في موقع آخر؟'));
});

test('2.26 order confirmation remains concise and offers only available cash payment', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const form = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
  assert.ok(form.includes('<h2>تأكيد الطلب</h2>'));
  assert.ok(form.includes('هل لديك قسيمة تخفيض؟'));
  assert.ok(form.includes('عنوان التوصيل'));
  assert.ok(form.includes('ملاحظات الطلب'));
  assert.ok(form.includes('وقت الطلب'));
  assert.ok(form.includes('value="CASH" checked'));
  assert.ok(!form.includes('value="CARD"'));
});

test('2.26 opens order follow-up only after successful creation, for standard orders and trips', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('تمّت إضافة الطلب بنجاح'));
  assert.ok(app.includes('id="trackCreatedOrder" type="button">متابعة الطلب</button>'));
  assert.ok(!app.includes('await customer();await openOrder(j.order.id)'));
});

test('2.26 customer tracking view does not expose raw coordinates', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const view = app.slice(app.indexOf('async function openOrder(id:string'), app.indexOf('async function openSavedLocations'));
  assert.ok(!view.includes('الإحداثيات المحفوظة مع الطلب:'));
  assert.ok(!view.includes('o.trip.destination.lat).toFixed(6)'));
});

test('2.26 mobile car wash no longer requires wash-scope or car-type form data', () => {
  const orders = fs.readFileSync('src/modules/orders.ts', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(orders.includes("fields.filter((field) => !['wash_scope', 'car_type'].includes(field.key))"));
  assert.ok(app.includes("new Set(['wash_scope','car_type'])"));
});
