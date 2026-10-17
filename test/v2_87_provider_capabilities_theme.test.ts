import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('2.87: provider capability picker has explicit readable light and dark theme colors', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  for (const selector of [
    '.provider-shell .capability-dropdown',
    '.provider-shell .capability-dropdown summary',
    '.provider-shell .capability-options label',
    '.provider-shell .capability-options label span',
    '.provider-shell .selected-capabilities .status',
  ]) assert.ok(css.includes(selector), `missing capability theme selector: ${selector}`);
  assert.match(css, /:root\[data-theme="dark"\] \.provider-shell \.capability-dropdown\{background:#1b2a40!important;color:#eef4fc!important/);
  assert.match(css, /:root\[data-theme="dark"\] \.provider-shell \.capability-options label\{background:#22334b!important;color:#eef4fc!important/);
  assert.match(css, /:root\[data-theme="dark"\] \.provider-shell \.capability-options label span\{color:#eef4fc!important/);
});

test('2.87: capability selection remains wired to the real provider capabilities API', () => {
  const app = readFileSync('public/app.ts', 'utf8');
  assert.match(app, /api\('\/provider\/capabilities'\)/);
  assert.match(app, /api\('\/provider\/capabilities',\{method:'PUT',body:JSON\.stringify\(\{capabilities:keys\}\)\}\)/);
  assert.match(app, /data-capability/);
});

test('2.87: primary and additional service quantities remain independent through persistence and tracking parsing', async () => {
  const { startApp, registerUser } = await import('./helpers.js');
  const { parseTrackingProductLines } = await import('../public/service-filter-logic.js');
  const t = await startApp();
  try {
    const customer = await registerUser(t.api);
    const services = t.app.db.all<any>('SELECT id,slug FROM services ORDER BY created_at LIMIT 10');
    assert.ok(services.length >= 2, 'seed catalog must contain services');
    const primary = services[0];
    const extra = services.find((x:any) => x.id !== primary.id)!;
    t.app.db.run('UPDATE services SET name_i18n=?,pricing_type=?,base_price=?,form_schema=? WHERE id=?', JSON.stringify({ar:'عامل بناء',en:'Construction worker'}), 'FIXED', 10000, JSON.stringify([{key:'quantity',type:'number',label:{ar:'عدد العمال',en:'Workers'},required:false,min:1,max:999}]), primary.id);
    t.app.db.run('UPDATE services SET name_i18n=?,pricing_type=?,base_price=?,form_schema=? WHERE id=?', JSON.stringify({ar:'غسل سيارة متنقل',en:'Mobile car wash'}), 'FIXED', 5000, JSON.stringify([{key:'washType',type:'text',label:{ar:'نوع الغسيل',en:'Wash type'},required:true,maxLength:80}]), extra.id);
    t.app.catalog.invalidate();
    const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: {
      serviceId: primary.id, description: 'عامل بناء', contactPhone: '+967771234567',
      formData: { quantity: 3 },
      additionalServices: [{ serviceId: extra.id, quantity: 1, formData: { washType: 'غسيل داخلي وخارجي' } }],
    }});
    assert.equal(created.status, 201, created.text);
    const stored = t.app.db.get<any>('SELECT form_data,price_snapshot,description FROM orders WHERE id=?', created.body.order.id);
    const formData = JSON.parse(stored.form_data);
    assert.equal(formData.quantity, 3);
    assert.equal(formData.additionalServices[0].quantity, 1);
    assert.equal(formData.additionalServices[0].formData.washType, 'غسيل داخلي وخارجي');
    assert.equal(Number(stored.price_snapshot), 35000);
    const rows = parseTrackingProductLines(stored.description, 'عامل بناء', formData, Number(stored.price_snapshot));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'عامل بناء');
    assert.equal(rows[0].quantity, 3);
    assert.equal(rows[0].unitPrice, 10000);
    assert.equal(rows[0].lineTotal, 30000);
    assert.equal(rows[1].name, 'غسل سيارة متنقل');
    assert.equal(rows[1].quantity, 1);
    assert.equal(rows[1].unitPrice, 5000);
    assert.equal(rows[1].lineTotal, 5000);
  } finally { await t.close(); }
});
