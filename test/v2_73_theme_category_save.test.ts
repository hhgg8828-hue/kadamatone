import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('public/js/app.js', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };

test('v2.73: customer category selection filters services in place instead of opening a separate picker', () => {
  assert.match(app, /const applyHomeCategory = \(slug\)/);
  assert.match(app, /applyServiceFilter\(activeHomeServiceFilter\)/);
  assert.match(app, /categoryMatch = !selectedHomeCategorySlug/);
  assert.match(app, /data-service-filter-empty/);
});

test('v2.73: service save has duplicate-submit protection, timeout recovery and success feedback', () => {
  assert.match(app, /serviceSaveInProgress/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /انتهت مهلة الحفظ/);
  assert.match(app, /تمت إضافة الخدمة بنجاح/);
  assert.match(app, /finally \{/);
});

test('v2.73: dark theme covers modal heads, about-app cards, checkout payment and time surfaces', () => {
  assert.match(css, /:root\[data-theme="dark"\] \.modal>\.card/);
  assert.match(css, /:root\[data-theme="dark"\] \.about-app-services span/);
  assert.match(css, /:root\[data-theme="dark"\] \.checkout-reference-payment/);
  assert.match(css, /:root\[data-theme="dark"\] \.admin-tab-dialog-head/);
  assert.match(css, /overflow-x:clip/);
});

test('v2.73: all app shells and service worker cache use current version', () => {
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(`app.js?v=${pkg.version}`), `${file} JS version`);
    assert.ok(html.includes(`app.css?v=${pkg.version}`), `${file} CSS version`);
    assert.ok(html.includes(`/sw.js?v=${pkg.version}`), `${file} service-worker version`);
  }
  assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes(`khadamat-shell-v${pkg.version.replace('.', '-')}`));
});

test('v2.73: customer bottom navigation follows scroll direction and contact icon has no stray dot overlay', () => {
  assert.match(fs.readFileSync('public/app.ts', 'utf8'), /customerScrollNavInstalled/);
  assert.match(fs.readFileSync('public/app.ts', 'utf8'), /nav-hidden-on-scroll/);
  assert.match(css, /customer-contact-top-btn::before/);
});
