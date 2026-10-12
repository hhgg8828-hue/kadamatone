import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('V83.2: الهوية الموحدة خضراء عبر واجهات العميل والمقدم والإدارة', () => {
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes('app.js?v=2.10'), `${file} should request current app assets`);
    assert.ok(html.includes('#176b4d'), `${file} should use the green brand theme`);
  }
  for (const file of ['public/manifest.webmanifest','public/manifest-customer.webmanifest','public/manifest-provider.webmanifest','public/manifest-admin.webmanifest']) {
    const manifest = fs.readFileSync(file, 'utf8');
    assert.ok(manifest.includes('"theme_color":"#176b4d"'), `${file} should use the green theme color`);
  }
});

test('V83.2: بطاقات خدمات مقدم الخدمة تستخدم أيقونات SVG موحدة', () => {
  const app = fs.readFileSync('public/js/app.js', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.ok(app.includes('provider-service-visual'));
  assert.ok(app.includes('serviceIconSvg(s.name'));
  assert.ok(css.includes('.provider-service-visual'));
  assert.ok(css.includes('.admin-tabs'));
  assert.ok(css.includes('prefers-reduced-motion'));
});
