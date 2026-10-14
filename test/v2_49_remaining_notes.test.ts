import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('public/app.ts', 'utf8');
const migration = readFileSync('src/db/migrations/037_order_store_category.sql', 'utf8');
const admin = readFileSync('src/modules/admin.operations.ts', 'utf8');

test('offline order fallback prepares SMS to configured administration phone and discloses manual send', () => {
  assert.match(app, /state\.config\?\.adminSmsPhone/);
  assert.match(app, /sms:\$\{adminPhone/);
  assert.match(app, /اضغط إرسال بنفسك/);
  assert.match(app, /لن يُعد الطلب مستلمًا أو مقبولًا/);
});

test('location is persisted locally and added to saved addresses after login', () => {
  assert.match(app, /khadamat\.currentLocation\.v1/);
  assert.match(app, /موقعي الحالي/);
  assert.match(app, /api\('\/me\/addresses', \{ method:'POST'/);
});

test('store recommendations support a persisted category and admin image upload', () => {
  assert.match(migration, /ADD COLUMN category_name/);
  assert.match(admin, /category_name/);
  assert.match(app, /name="imageFile" type="file"/);
  assert.match(app, /purpose:'service_icon'/);
});
