import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';

test('V2.87: provider capability/skills picker has dark-mode contrast rules', () => {
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /data-theme="dark"\] \.provider-shell \.capability-dropdown/);
  assert.match(css, /data-theme="dark"\] \.provider-shell \.capability-options label/);
  assert.match(css, /data-theme="dark"\] \.provider-shell \.capability-options label span/);
});

test('V2.87: trip type defaults to parcel delivery but remains a selectable dropdown', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /<select id="tripPurpose" required>\$\{Object\.entries\(purposeLabels\)\.map\(\(\[k,v\]\)=>`<option value="\$\{k\}" \$\{k==='PARCEL'\?'selected':''\}>/);
  assert.match(app, /يمكنك تغييره من القائمة حسب حاجتك/);
});

test('V2.87: real route service failure does not fall back to straight-line fare', async () => {
  const t = await startApp({ ROUTING_URL: 'https://127.0.0.1:1', ROUTING_TIMEOUT_MS: '50' } as any);
  try {
    const c = await registerUser(t.api);
    const r = await t.api('POST', '/api/v1/trips/estimate', { token: c.body.accessToken, body: { origin: { lat: 13.9759, lng: 44.1709 }, destination: { lat: 13.98, lng: 44.18 }, stops: [] } });
    assert.notEqual(r.status, 200, 'must not return a price from a straight-line approximation');
    assert.match(String(r.text || JSON.stringify(r.body)), /ROUTING|مسافة القيادة|التوجيه/i);
  } finally { await t.close(); }
});


test('V2.87: ten road kilometers at 1,000 rials per kilometer costs exactly 10,000 rials', async () => {
  const t = await startApp({ ROUTING_URL: 'https://routing.test', ROUTING_TIMEOUT_MS: '500' } as any);
  const originalFetch = globalThis.fetch;
  try {
    t.app.settings.set('trips.base_fare', 0);
    t.app.settings.set('trips.per_km_fare', 1000);
    t.app.settings.set('trips.minimum_fare', 0);
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).startsWith('https://routing.test/route/v1/driving/')) {
        return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 10000, duration: 600 }] }) } as any;
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    const c = await registerUser(t.api);
    const r = await t.api('POST', '/api/v1/trips/estimate', { token: c.body.accessToken, body: { origin: { lat: 13.9759, lng: 44.1709 }, destination: { lat: 13.98, lng: 44.18 }, stops: [] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.distanceKm, 10);
    assert.equal(r.body.fare, 10000);
    assert.equal(r.body.method, 'ROAD_ROUTING');
  } finally { globalThis.fetch = originalFetch; await t.close(); }
});
