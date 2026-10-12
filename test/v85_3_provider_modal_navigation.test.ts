import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V85.3: provider verification and vehicle actions use visible, intentional controls', () => {
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.match(app, /id="addVehicleBtn" type="button">\+ إضافة مركبة/);
  assert.match(app, /id="saveCapabilities" type="button">حفظ القدرات/);
  assert.match(app, /id="identityUploadDropdown"/);
  assert.match(app, /id="licenseUploadDropdown"/);
  for (const identityType of ['NATIONAL_ID', 'RESIDENT_ID', 'PASSPORT', 'OTHER']) {
    assert.ok(app.includes(`value="${identityType}"`), `identity type ${identityType} should be selectable`);
  }
  assert.match(app, /dropdown\.open=false/);
});

test('V85.3: identity document type is persisted by the provider document API', () => {
  const route = fs.readFileSync('src/modules/providers.ts', 'utf8');
  const migration = fs.readFileSync('src/db/migrations/033_provider_document_identity_type.sql', 'utf8');
  assert.match(route, /identityType\?: 'NATIONAL_ID' \| 'RESIDENT_ID' \| 'PASSPORT' \| 'OTHER'/);
  assert.match(route, /identity_type = \?/);
  assert.match(route, /identity_type\) VALUES/);
  assert.match(migration, /ADD COLUMN identity_type TEXT/);
  assert.match(migration, /'NATIONAL_ID','RESIDENT_ID','PASSPORT','OTHER'/);
});
