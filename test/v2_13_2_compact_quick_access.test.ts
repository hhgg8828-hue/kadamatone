import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.13.2 restores the compact quick-access composer approved in 2.10/2.11', () => {
  const js = fs.readFileSync('public/js/app.js', 'utf8');
  assert.ok(js.includes('id="quickAssistForm"'), 'quick-access form should exist');
  assert.ok(js.includes('id="quickAssistVoice"'), 'quick-access should have the talk button');
  assert.ok(js.includes('id="quickAssistResults"'), 'service suggestions should remain available');
  assert.ok(!js.includes('simpleRequestForm'), 'large three-step request form must not return');
  assert.ok(!js.includes('service-orbit'), 'decorative service orbit must not return in the customer view');
  assert.ok(!js.includes('khadamat-news-ticker'), 'marketing ticker must not return in the customer view');
  assert.ok(!js.includes('simpleRequestImage'), 'image upload must not be part of quick access');
});

test('2.13.2 uses the existing intent search and never auto-submits an order from quick access', () => {
  const js = fs.readFileSync('public/js/app.js', 'utf8');
  assert.ok(js.includes("api('/search/intent'"), 'quick access should suggest matching services');
  assert.ok(js.includes("form.addEventListener('submit', e => e.preventDefault())"), 'quick access should not submit an order automatically');
  assert.ok(!js.includes('setupSimpleRequestComposer'), 'removed composer must not be called');
});
