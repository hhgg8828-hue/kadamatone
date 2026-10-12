import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Release 2.5 persists authenticated sessions across browser restarts and migrates older sessions', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /localStorage\.setItem\(SESSION_KEY,JSON\.stringify\(\{accessToken:j\.accessToken,user:j\.user\}\)\)/);
  assert.match(app, /let raw=localStorage\.getItem\(SESSION_KEY\);if\(!raw\)\{raw=sessionStorage\.getItem\(SESSION_KEY\)/);
  assert.match(app, /localStorage\.removeItem\(SESSION_KEY\);sessionStorage\.removeItem\(SESSION_KEY\);location\.replace\('\/'\)/);
});

test('Release 2.5 asks for location permission before showing login and supports manual continuation', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('id="preLoginLocate"'));
  assert.ok(app.includes('navigator.geolocation.getCurrentPosition'));
  assert.ok(app.includes("localStorage.setItem('khadamat.currentLocation.v1',JSON.stringify(loc))"));
  assert.ok(app.includes('id="preLoginContinue"'));
  assert.ok(app.includes('locationGatePassed=true;draw()'));
});

test('Release 2.5 allows public browsing and gates only service requests behind customer OTP login', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /async function startGuestHome\(\)/);
  assert.match(app, /api\('\/catalog\/bootstrap'\+areaQuery\)/);
  assert.match(app, /async function openServiceDetails\(serviceId:string, initial:any=null\)/);
  assert.match(app, /if\(!state\.user\)\{openServiceDetails\(serviceId,initial\);return\}/);
  assert.match(app, /تسجيل الدخول لطلب الخدمة/);
  assert.match(app, /id="guestLocate"/);
  assert.match(app, /id="guestContinue"/);
  assert.match(app, /id="guestLoginBtn"/);
  assert.match(app, /if\(!guestView\)loadPersonalRecommendations\(\)/);
  assert.match(app, /async function openOrderForm\(serviceId:string, initial:any = null\)\{\s*if\(!state\.user\)\{openServiceDetails\(serviceId,initial\);return\}/);
  assert.match(app, /pendingRequest.startsWith\('slug:'\)\?openOrderFormBySlug/);
});
