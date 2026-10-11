import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Release 2.2 persists authenticated sessions across browser restarts and migrates older sessions', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /localStorage\.setItem\(SESSION_KEY,JSON\.stringify\(\{accessToken:j\.accessToken,user:j\.user\}\)\)/);
  assert.match(app, /let raw=localStorage\.getItem\(SESSION_KEY\);if\(!raw\)\{raw=sessionStorage\.getItem\(SESSION_KEY\)/);
  assert.match(app, /localStorage\.removeItem\(SESSION_KEY\);sessionStorage\.removeItem\(SESSION_KEY\);location\.replace\('\/'\)/);
});

test('Release 2.2 asks for location permission before showing login and supports manual continuation', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.ok(app.includes('id="preLoginLocate"'));
  assert.ok(app.includes('navigator.geolocation.getCurrentPosition'));
  assert.ok(app.includes("localStorage.setItem('khadamat.currentLocation.v1',JSON.stringify(loc))"));
  assert.ok(app.includes('id="preLoginContinue"'));
  assert.ok(app.includes('locationGatePassed=true;draw()'));
});
