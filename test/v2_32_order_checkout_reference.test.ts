import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V2.34 uses service-specific fields and only shows generic details when needed', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
  assert.ok(flow.includes('const hasDedicatedDescription='));
  assert.ok(flow.includes("const quantityFieldsHtml=quantityFields.map(renderField).join('')"));
  assert.ok(flow.includes('${descriptionFieldHtml}${fields}${quantityFieldsHtml}'));
  assert.ok(flow.includes('const needsGenericDescription=!hasDedicatedDescription&&'));
  assert.ok(flow.includes('const descriptionFieldHtml=hasDedicatedDescription||!needsGenericDescription?\'\':'));
  assert.ok(!flow.includes('${optionalFieldsHtml}'));
  assert.ok(!flow.includes('id="orderItemSummary"'));
  assert.ok(flow.includes('id="submitOrderBtn" type="submit">متابعة</button>'));
  assert.ok(flow.includes('ما المطلوب|اسم الدواء|الغرض المطلوب'));
  assert.ok(!flow.includes('id="orderProductUrl"'));
});

test('V2.34 shows the concise order details table on the confirmation step', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
  assert.ok(flow.includes('const orderDetailRows='));
  assert.ok(flow.includes('class="order-details-table"'));
  assert.ok(flow.includes('${orderDetailRows(fdReview).join(\'\')}'));
  assert.ok(flow.includes('id="orderCheckoutFields" class="hide-section"'));
  assert.ok(flow.includes("document.getElementById('reviewAddressEditor')?.appendChild(checkoutFields)"));
  assert.ok(flow.includes('id="contactPhone" name="contactPhone"'));
  assert.ok(flow.includes('name="reviewOrderTime" value="now" checked'));
  assert.ok(flow.includes('id="reviewConfirmOrder">تنفيذ الطلب</button>'));
});

test('V2.34 confirmation avoids extra product questions after the customer completed service details', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
  assert.ok(!flow.includes('id="customProductName"'));
  assert.ok(!flow.includes('id="reviewExtraDetails"'));
  assert.ok(!flow.includes('منتج إضافي (اختياري)'));
  assert.ok(flow.includes('id="reviewOrderNote"'));
});

test('V2.34 app assets and service-worker cache are aligned', () => {
  for (const file of ['public/index.html','public/customer.html','public/provider.html','public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes('app.js?v=2.36'), file);
    assert.ok(html.includes('app.css?v=2.36'), file);
  }
  assert.ok(fs.readFileSync('public/sw.js','utf8').includes('khadamat-shell-v2-36'));
});
