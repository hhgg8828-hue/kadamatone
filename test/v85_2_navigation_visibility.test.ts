import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V85.2: admin modules are displayed in a wrapping grid instead of hidden in horizontal scrolling', () => {
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /\.admin-tabs\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important;[\s\S]*?overflow:visible!important/);
  assert.match(css, /@media\(max-width:600px\)\{\.admin-tabs\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  const app = fs.readFileSync('public/app.ts', 'utf8');
  for (const tab of ['orders', 'liveOps', 'command', 'users', 'complaints', 'reports', 'system']) {
    assert.ok(app.includes(`data-admin-tab="${tab}"`), `admin tab ${tab} must remain available`);
  }
});

test('V85.2: provider dashboard includes quick navigation to operational sections', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  for (const target of ['providerNotificationPanel', 'offers', 'myorders', 'providerServicesSection', 'verificationCard', 'providerLocationCard', 'providerVehicleCard', 'providerCapabilitiesCard']) {
    assert.ok(app.includes(`data-provider-target="${target}"`), `provider quick button ${target} must exist`);
  }
});
