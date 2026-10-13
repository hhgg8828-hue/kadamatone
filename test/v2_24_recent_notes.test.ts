import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.26 renders the reference home order and provides complete galleries', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const offers = app.indexOf('<section class="customer-offers"');
  const categories = app.indexOf('customer-category-showcase customer-category-showcase-top');
  assert.ok(offers >= 0 && categories > offers);
  assert.ok(app.includes('id="allCategoriesBtn"'));
  assert.ok(app.includes('id="allOffersBtn"'));
  assert.ok(app.includes('data-all-offer'));
});

test('2.24 order confirmation supports now/later scheduling and a concise note preview', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('name="reviewOrderTime" value="now" checked'));
  assert.ok(app.includes('name="reviewOrderTime" value="later"'));
  assert.ok(app.includes('id="reviewScheduledAt"'));
  assert.ok(app.includes('const scheduledAt=confirmedScheduledAt'));
  assert.ok(app.includes('لا توجد ملاحظة'));
  assert.ok(app.includes('id="reviewChangeAddress"'));
});

test('2.24 campaign category actions are accepted by create/update API and saving is guarded against double submit', () => {
  const api = fs.readFileSync('src/modules/admin.operations.ts', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.equal((api.match(/'CATEGORY'/g) || []).length >= 2, true);
  assert.ok(app.includes('value="CATEGORY"'));
  assert.ok(app.includes('let campaignSaving=false'));
  assert.ok(app.includes('let temporarySaving=false'));
});

test('2.24 assets use a new cache version and back navigation asks before leaving', () => {
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(sw.includes('khadamat-shell-v2-26'));
  assert.ok(app.includes('هل ترغب في الخروج؟'));
});

test('2.26 confirmation follows the concise reference order and uses the agreed action labels', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const confirm = app.slice(app.indexOf('review.innerHTML=`'), app.indexOf('const originalChildren=', app.indexOf('review.innerHTML=`')));
  assert.ok(confirm.indexOf('هل لديك قسيمة تخفيض؟') < confirm.indexOf('عنوان التوصيل'));
  assert.ok(confirm.indexOf('عنوان التوصيل') < confirm.indexOf('ملاحظات الطلب'));
  assert.ok(confirm.indexOf('ملاحظات الطلب') < confirm.indexOf('وقت الطلب'));
  assert.ok(confirm.indexOf('وقت الطلب') < confirm.indexOf('طريقة الدفع'));
  assert.ok(app.includes('id="submitOrderBtn" type="submit">تنفيذ الطلب</button>'));
  assert.ok(app.includes('id="trackCreatedOrder" type="button">متابعة الطلب</button>'));
});
