import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, loginAdmin } from './helpers.js';

const frontend = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const customerShell = fs.readFileSync('public/customer.html', 'utf8');

test('2.19 keeps the agreed one-box quick access and visible background', () => {
  assert.match(frontend, /id="quickAssistForm" class="quick-assist-card"/);
  assert.match(frontend, /id="quickAssistText"/);
  assert.match(frontend, /id="quickAssistVoice"/);
  assert.equal(/simple-request-step/.test(frontend), false);
  assert.match(css, /quick-assist-head h1\{color:#fff!important/);
  assert.match(css, /hero\.customer-simple-hero\{background:linear-gradient/);
});

test('customer home shows an editable news ticker even when no message is configured', () => {
  assert.match(frontend, /اختر منطقتك لتشاهد الخدمات والعروض المتاحة بالقرب منك/);
  assert.match(frontend, /news-ticker-track/);
  assert.match(css, /@keyframes khadamatCustomerTicker/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('campaign cards open their configured service/order/trip action and categories are touch-friendly squares', () => {
  assert.match(frontend, /data-campaign-card/);
  assert.match(frontend, /t==='SERVICE'\|\|t==='ORDER'/);
  assert.match(frontend, /t==='TRIP'/);
  assert.match(frontend, /customer-category-tile/);
  assert.match(frontend, /customer-bottom-nav/);
  assert.match(frontend, /order-tracking-head/);
  assert.match(frontend, /name=\"categoryImage\" id=\"categoryImage\" type=\"file\"/);
  assert.match(frontend, /body\.icon='\/api\/v1\/files\/'\+uploaded\.file\.id/);
  assert.match(frontend, /data-cat="\$\{esc\(c\.slug\)\}"/);
  assert.match(css, /customer-category-art\{display:grid;place-items:center;width:100%;aspect-ratio:1\/1/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /aspect-ratio:1\/1;object-fit:cover;border-radius:0;grid-row:auto/);
});

test('customer account exposes request area, expandable phone, optional contact and GPS', () => {
  assert.match(frontend, /accountCurrentArea/);
  assert.match(frontend, /account-phone-disclosure/);
  assert.match(frontend, /رقم تواصل إضافي \(اختياري\)/);
  assert.match(frontend, /accountSetLocation/);
});

test('customer order confirmation includes coupon, address edit, inline note and quantity floor of one', () => {
  assert.match(frontend, /orderConfirmationStep/);
  assert.match(frontend, /هل لديك قسيمة تخفيض/);
  assert.match(frontend, /reviewChangeAddress/);
  assert.match(frontend, /reviewOrderNote/);
  assert.match(frontend, /Math\.max\(1,Math\.floor\(Number\(qty\.value\|\|1\)\)\|\|1\)/);
  assert.match(frontend, /الدفع عند الاستلام/);
  assert.match(frontend, /pharmacyProductName/);
  assert.match(frontend, /orderProductUrl/);
});

test('customer offer filters and favorites are interactive and saved locally', () => {
  assert.match(frontend, /data-offer-filter="nearby"/);
  assert.match(frontend, /data-offer-filter="new"/);
  assert.match(frontend, /data-offer-filter="favorite"/);
  assert.match(frontend, /khadamat\.favoriteCampaigns\.v1/);
  assert.match(css, /customer-offer-filters/);
});

test('customer shell uses versioned 2.19 assets to refresh cached layout', () => {
  assert.match(customerShell, /app\.css\?v=2\.19/);
  assert.match(customerShell, /app\.js\?v=2\.19/);
  assert.match(customerShell, /sw\.js\?v=2\.19/);
});


test('admin category editor can store an uploaded-image URL without a database migration', async () => {
  const t = await startApp();
  try {
    const token = await loginAdmin(t.api);
    const imageUrl = '/api/v1/files/12345678-1234-1234-1234-123456789abc';
    const created = await t.api('POST', '/api/v1/admin/categories', { token, body: {
      slug: 'photo-category-216', name: { ar: 'قسم بصورة', en: 'Photo category' }, icon: imageUrl, sortOrder: 900,
    } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.category.icon, imageUrl);
  } finally {
    await t.close();
  }
});
