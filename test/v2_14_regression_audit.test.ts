import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.14.0 restores concise customer order tracking without internal status chatter or finance/details accordions', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const bundle = fs.readFileSync('public/js/app.js', 'utf8');
  for (const [label, source, startMarker, endMarker] of [
    ['TypeScript source', app, 'async function openOrder(id:string){', 'async function openSavedLocations'],
    ['compiled browser bundle', bundle, 'async function openOrder(id) {', 'async function openSavedLocations']
  ] as const) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `${label}: customer order tracking function should exist`);
    const section = source.slice(start, end);
    for (const item of ['معلومات الطلب', 'نوع الخدمة', 'مشاهدة عروض الأسعار']) assert.ok(section.includes(item), `${label}: ${item} should remain visible`);
    for (const unwanted of ['إشعار الطلب', 'تغيرت حالة الطلب إلى', 'الملخص المالي', 'تفاصيل إضافية للخدمة', 'سجل متابعة الطلب', 'order-timeline']) assert.ok(!section.includes(unwanted), `${label}: ${unwanted} should not be in the customer tracking modal`);
  }
});

test('2.14.0 admin sections open in a modal and have a clear return action', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(app, /class="admin-tab-content \$\{activeTab==='overview'\?'is-overview':'is-modal'\}"/);
  assert.match(app, /id="closeAdminTab"/);
  assert.match(app, /adminTabTitle\(activeTab\)/);
  assert.match(app, /activeTab='overview';history\.replaceState\(null,'','\/admin'\);window\.scrollTo\(\{top:0,behavior:'auto'\}\);draw\(\)/);
  assert.match(css, /\.admin-tab-content\.is-modal\{position:fixed/);
  assert.match(css, /\.admin-tab-modal-panel\{[^}]*overflow:auto/);
});

test('2.14.0 requested portal is not redirected to a different saved role', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /const portalRole:'CUSTOMER'\|'PROVIDER'\|'ADMIN'=page==='provider'\?'PROVIDER':page==='admin'\?'ADMIN':'CUSTOMER'/);
  assert.match(app, /if\(state\.user!\.role!==portalRole\)[\s\S]*?authBox\(portalRole\)/);
  assert.ok(!app.includes('if(location.pathname!==expected) location.replace(expected)'), 'role mismatch must not force the browser to another portal');
});

test('2.14.0 About dialog reads the central release history and role-specific favicons are configured', () => {
  const history = JSON.parse(fs.readFileSync('public/release-notes.json', 'utf8'));
  assert.equal(history.currentVersion, '2.15.0');
  assert.ok(history.releases.some((x: any) => x.version === '2.10.0'));
  assert.ok(history.releases.some((x: any) => x.version === '2.14.0'));
  assert.ok(history.releases.some((x: any) => x.version === '2.15.0'));
  assert.match(fs.readFileSync('public/app.ts', 'utf8'), /fetch\('\/release-notes\.json\?v=2\.15\.0'/);
  for (const [file, icon] of [['public/customer.html','icon-customer-192.png'],['public/provider.html','icon-provider-192.png'],['public/admin.html','icon-admin-192.png']] as const) {
    assert.ok(fs.readFileSync(file, 'utf8').includes(`/icons/${icon}`), `${file} should use its own favicon`);
  }
});

test('2.14.0 retains provider verification dropdowns, modal quick navigation, and capability-save collapse', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /function openProviderPanel\(targetId:string,title:string\)/);
  assert.match(app, /id="identityUploadDropdown"/);
  assert.match(app, /id="licenseUploadDropdown"/);
  assert.match(app, /if\(dropdown\)dropdown\.open=false/);
  assert.match(app, /id="addVehicleBtn" class="btn provider-primary-action"/);
});
