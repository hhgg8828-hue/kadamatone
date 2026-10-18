import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const frontend = fs.readFileSync('public/app.ts', 'utf8');
const styles = fs.readFileSync('public/css/app.css', 'utf8');
const locations = fs.readFileSync('src/modules/locations.ts', 'utf8');
const users = fs.readFileSync('src/modules/users.ts', 'utf8');
const platform = fs.readFileSync('src/modules/platform.ts', 'utf8');
const serviceWorker = fs.readFileSync('public/sw.js', 'utf8');

test('saved address creation offers map selection as an alternative to GPS', () => {
  assert.match(frontend, /اختيار النقطة من الخريطة/);
  assert.match(frontend, /bindSavedAddressMap\('addressMapBtn','addressMap'/);
  assert.match(frontend, /source:pickedSource==='map'\?'map':'gps'/);
});

test('saved address editing can update coordinates by map or GPS', () => {
  assert.match(frontend, /bindSavedAddressMap\('editAddressMapBtn','editAddressMap'/);
  assert.match(frontend, /body\.location=\{lat:nlat,lng:nlng/);
  assert.match(frontend, /source:pickedSource==='map'\?'map':'gps'/);
  assert.match(frontend, /PATCH',body:JSON.stringify\(body\)/);
});

test('map-selected coordinates are validated and GPS accuracy remains enforced', () => {
  assert.match(frontend, /lat < -90\|\|lat > 90\|\|lng < -180\|\|lng > 180/);
  assert.match(frontend, /pickedSource==='gps'&&\(!Number.isFinite\(accuracy\)\|\|Number\(accuracy\)>1000\)/);
  assert.match(locations, /s.oneOf\(\['gps', 'map', 'manual'\]/);
});

test('address map is responsive and has a dark theme fallback', () => {
  assert.match(styles, /\.saved-address-map\{height:260px/);
  assert.match(styles, /:root\[data-theme="dark"\] \.saved-address-map/);
});

test('server address patch remains scoped to the authenticated customer', () => {
  assert.match(users, /r\.patch\('\/me\/addresses\/:id', auth, roles\('CUSTOMER'\)/);
  assert.match(users, /WHERE id = \? AND user_id = \?/);
});

test('platform and service worker advertise the 2.95 release', () => {
  assert.match(platform, /appVersion: '2\.95'/);
  assert.match(serviceWorker, /khadamat-shell-v2-95/);
});
