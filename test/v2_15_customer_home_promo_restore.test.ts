import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.15.0 restores customer location, compact quick access, green hero, ticker and square promo cards', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  const css = fs.readFileSync('public/css/app.css', 'utf8');
  const history = JSON.parse(fs.readFileSync('public/release-notes.json', 'utf8'));
  const start = app.indexOf('function renderCustomer(){');
  const end = app.indexOf('function ', start + 20);
  assert.ok(start >= 0 && end > start, 'renderCustomer function exists');
  const home = app.slice(start, end);
  for (const token of ['customerCitySelect', 'customerUseLocation', 'quickAssistText', 'quickAssistVoice', 'khadamat-news-ticker', 'promo-square-grid', 'promo-square-card']) assert.ok(home.includes(token), `home should include ${token}`);
  assert.ok(!home.includes('simple-request-step'), 'three-step request form must not return');
  assert.match(css, /customer-simple-hero\{[^}]*background:linear-gradient\(135deg,#075b45 0%,#087b59 58%,#269878 100%\)!important/);
  assert.match(css, /promo-square-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /promo-square-card\{[^}]*aspect-ratio:1\/1/);
  assert.equal(history.currentVersion, '2.15.0');
  assert.equal(history.releases[0]?.version, '2.15.0');
});
