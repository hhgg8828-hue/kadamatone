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
test('V85.3: provider quick navigation opens modal panels instead of jumping down the page', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    for (const target of ['providerNotificationWorkspace', 'providerNewOrdersSection', 'providerMyOrdersSection', 'providerServicesSection', 'verificationCard', 'providerLocationCard', 'providerVehicleCard', 'providerCapabilitiesCard']) {
        assert.ok(app.includes(`data-provider-panel="${target}"`), `provider modal button ${target} must exist`);
    }
    assert.match(app, /function openProviderPanel\(targetId:string,title:string\)/);
    assert.match(app, /openProviderPanel\('providerNewOrdersSection','الطلبات الجديدة'\)/);
    assert.match(app, /openProviderPanel\('verificationCard','توثيق الحساب'\)/);
});
//# sourceMappingURL=v85_2_navigation_visibility.test.js.map