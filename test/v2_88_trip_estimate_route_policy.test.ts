import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.88: production route estimation does not silently fall back to straight-line pricing',()=>{
  const trips=fs.readFileSync('src/modules/trips.ts','utf8');
  const routeBody=trips.slice(trips.indexOf('async function drivingRoute'),trips.indexOf('function price('));
  assert.match(routeBody,/ROUTING_UNAVAILABLE/);
  assert.match(routeBody,/ROUTING_TIMEOUT/);
  assert.ok(!/return \{distanceKm:km,durationMin:null,method:'STRAIGHT_LINE_TEST'\}/.test(routeBody));
  assert.match(routeBody,/mock:\/\/straight-line/);
});

test('2.88: trip estimate hides technical routing explanation from customer-facing UI',()=>{
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.ok(!/تم احتساب التقدير حسب المسار المتاح/.test(app));
  assert.ok(!/<small class="muted" id="tripEstimateNote">/.test(app));
  assert.match(app,/تم حساب تقدير المشوار/);
});
