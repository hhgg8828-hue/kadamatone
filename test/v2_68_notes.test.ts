import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');
const customerHtml = readFileSync('public/index.html', 'utf8');
const adminHtml = readFileSync('public/admin.html', 'utf8');

test('2.68 places search beside contact and notifications in the customer action group', () => {
  const topbar = app.slice(app.indexOf('function shell('), app.indexOf('function authBox('));
  assert.ok(topbar.indexOf('customerContactToggle') < topbar.indexOf('customerSearchToggle'));
  assert.ok(topbar.indexOf('customerSearchToggle') < topbar.indexOf('notificationsBtn'));
  assert.match(app, /customerContactOptions.*hide-section/);
});

test('2.68 renders additional active categories from the catalog instead of hardcoding only featured categories', () => {
  assert.match(app, /const additional=all\.filter/);
  assert.match(app, /return \[\.\.\.featured,\.\.\.additional\]/);
  assert.match(app, /\$\{cat\.isActive\?'نشط':'معطل'\} · \$\{\(cat\.services\|\|\[\]\)\.length\} خدمات/);
});

test('2.68 scheduled orders reveal and require a future date and time', () => {
  assert.match(app, /scheduledField\.required=later/);
  assert.match(app, /scheduledField\.min=now\.toISOString\(\)\.slice\(0,16\)/);
  assert.match(app, /اختر وقتًا لاحقًا صحيحًا/);
});

test('2.68 order cards include semantic state classes for color coding', () => {
  assert.match(app, /order-state-\$\{esc\(/);
  assert.match(css, /\.order-state-searching/);
  assert.match(css, /\.order-state-on-the-way/);
  assert.match(css, /\.order-state-completed/);
  assert.match(css, /\.order-state-cancelled/);
});

test('2.68 push notices use Arabic direction and a valid customer icon', () => {
  assert.match(sw, /showNotification\(title,options\)/);
  assert.match(sw, /dir:'rtl'/);
  assert.match(sw, /icon:'\/icons\/icon-customer-192\.png'/);
});

test('2.68 prevents accidental horizontal overflow and shows notices at the top across the viewport', () => {
  assert.match(css, /\.customer-shell\{max-width:100%;overflow-x:clip\}/);
  assert.match(css, /\.live-toast-host\{top:env\(safe-area-inset-top,0px\)!important/);
  assert.match(css, /width:100%!important;max-width:none!important/);
});

test('2.68 cache-busts the app shells and service worker', () => {
  for (const html of [customerHtml, adminHtml]) {
    assert.match(html, /app\.js\?v=2\.68/);
    assert.match(html, /app\.css\?v=2\.68/);
    assert.match(html, /sw\.js\?v=2\.68/);
  }
  assert.match(sw, /khadamat-shell-v2-68/);
});
