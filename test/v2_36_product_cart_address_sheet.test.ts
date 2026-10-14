import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V2.36 pharmacy flow supports multiple products, optional images, quantity floor and delete controls', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const flow = app.slice(app.indexOf('function openPharmacyProductFlow('), app.indexOf('function openCampaignCategories'));
  assert.ok(flow.includes('const products:PharmacyProduct[]=[]'));
  assert.ok(flow.includes('id="pharmacyProductImage" type="file"'));
  assert.ok(flow.includes('id="pharmacyAddProduct"'));
  assert.ok(flow.includes('data-product-delete'));
  assert.ok(flow.includes('Math.max(1,p.quantity-1)'));
  assert.ok(flow.includes('عرض الفاتورة والمتابعة'));
  assert.ok(flow.includes('pharmacyProducts:products.map'));
  assert.ok(flow.includes('pharmacyImages:images'));
});

test('V2.36 confirmation supports adding a pharmacy item and uploading its product images as order attachments', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('id="addReviewPharmacyProduct"'));
  assert.ok(app.includes('id="saveReviewPharmacyProduct"'));
  assert.ok(app.includes('for(const imageItem of initial.pharmacyImages)'));
  assert.ok(app.includes("purpose:'order_attachment'"));
});

test('V2.36 delivery addresses use a bottom sheet with saved-address and map choices, and trips support scheduling', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('id="chooseTripOrigin"'));
  assert.ok(app.includes('id="chooseTripDestination"'));
  assert.ok(app.includes('من العناوين المحفوظة'));
  assert.ok(app.includes('من الخريطة'));
  assert.ok(app.includes('name="tripScheduleMode"'));
  assert.ok(fs.readFileSync('src/modules/trips.ts', 'utf8').includes('scheduledAt: s.str({ max: 40, optional: true })'));
});

test('V2.36 customer tracking retains the in-order chat and adds a visible status timeline', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const flow = app.slice(app.indexOf('async function openOrder(id:string)'), app.indexOf('async function openSavedLocations'));
  assert.ok(flow.includes('id="openChatBtn"'));
  assert.ok(flow.includes('customer-order-status-timeline'));
  assert.ok(flow.includes('renderOrderTimeline(o.status)'));
});
