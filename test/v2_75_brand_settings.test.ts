import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { after, before } from 'node:test';
import { startApp, loginAdmin, type TestApp } from './helpers.js';

let t: TestApp;
let token = '';
before(async () => { t = await startApp(); token = await loginAdmin(t.api); });
after(async () => { await t.close(); });

test('v2.75: branding settings are persisted and exposed for customer/provider/admin shells', async () => {
  const initial = await t.api('GET', '/api/v1/config');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.appCustomerName, 'خدمات الهيثم');
  assert.equal(initial.body.appProviderName, 'خدمات الهيثم (مقدّم خدمة)');
  assert.equal(initial.body.appAdminName, 'خدمات الهيثم (الإدارة)');
  const updates: Array<[string,string]> = [
    ['app.name','منصة هيثم'],
    ['app.customer_name','منصة هيثم'],
    ['app.provider_name','منصة هيثم (مقدّم خدمة)'],
    ['app.admin_name','منصة هيثم (الإدارة)'],
    ['app.tagline','كل خدمة في مكان واحد'],
  ];
  for (const [key,value] of updates) {
    const r = await t.api('PUT', `/api/v1/admin/settings/${encodeURIComponent(key)}`, { token, body: { value } });
    assert.equal(r.status, 200, `${key}: ${r.text}`);
  }
  const config = await t.api('GET', '/api/v1/config');
  assert.equal(config.body.appName, 'منصة هيثم');
  assert.equal(config.body.appCustomerName, 'منصة هيثم');
  assert.equal(config.body.appProviderName, 'منصة هيثم (مقدّم خدمة)');
  assert.equal(config.body.appAdminName, 'منصة هيثم (الإدارة)');
  const manifestResponse = await fetch(`${t.base}/manifest-provider.webmanifest`);
  const manifest = await manifestResponse.json() as any;
  assert.equal(manifest.name, 'منصة هيثم (مقدّم خدمة)');
});

test('v2.75: admin branding editor and theme surface overrides exist in source assets', () => {
  const app = fs.readFileSync('public/app.ts','utf8');
  const css = fs.readFileSync('public/css/app.css','utf8');
  assert.match(app, /brandSettingsForm/);
  assert.match(app, /app\.provider_name/);
  assert.match(app, /app\.admin_name/);
  assert.match(css, /:root\[data-theme="dark"\] \.about-app-services span/);
  assert.match(css, /:root\[data-theme="dark"\] \.notification-modal-head/);
  assert.match(css, /:root\[data-theme="light"\] \.modal input/);
});
