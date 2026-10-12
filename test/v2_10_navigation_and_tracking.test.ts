import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('admin sections open in an overlay with an explicit return button', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.ok(app.includes('class=\"admin-tab-backdrop\"'));
  assert.ok(app.includes('class=\"admin-tab-dialog\"'));
  assert.ok(app.includes('id=\"adminTabClose\"'));
  assert.ok(app.includes("document.getElementById('adminTabClose')?.addEventListener('click'"));
  assert.ok(css.includes('.admin-tab-dialog-content{'));
});

test('guest home no longer shows the unnecessary phone-verification notice', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(!app.includes('تصفّح الخدمات متاح للجميع. عند اختيار طلب خدمة سنطلب منك توثيق رقم هاتفك مرة واحدة.'));
});

test('customer tracking is concise and omits extra service details and financial summary', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const view = app.slice(app.indexOf('async function openOrder(id:string)'), app.indexOf('async function openSavedLocations'));
  assert.ok(view.includes('<h3>معلومات الطلب</h3>'));
  assert.ok(view.includes('<h3>نوع الخدمة</h3>'));
  assert.ok(!view.includes('class="order-latest-update"'));
  assert.ok(!view.includes('activeTimeline[0]?.title'));
  assert.ok(!view.includes('/timeline'));
  assert.ok(!view.includes('<summary>تفاصيل إضافية</summary>'));
  assert.ok(!view.includes('الملخص المالي'));
  assert.ok(view.includes('id="openQuotesBtn"'));
});

test('role-specific PWAs use separate icons and cache refreshes navigation from network first', () => {
  for (const role of ['customer', 'provider', 'admin']) {
    const html = fs.readFileSync(`public/${role}.html`, 'utf8');
    const manifest = fs.readFileSync(`public/manifest-${role}.webmanifest`, 'utf8');
    assert.ok(html.includes(`/icons/icon-${role}-192.png`));
    assert.ok(manifest.includes(`/icons/icon-${role}-192.png`));
  }
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert.ok(sw.includes('khadamat-shell-v2-22'));
  assert.ok(sw.includes("e.request.mode==='navigate'"));
  assert.ok(sw.includes("'/js/app.js'"));
});
