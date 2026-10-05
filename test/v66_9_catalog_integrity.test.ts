import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp } from './helpers.js';

const HISTORICAL_SERVICE_SLUGS = [
  'motorcycle-trips','car-with-driver','passenger-transport','freight-transport','furniture-moving',
  'parcel-delivery','shopping-delivery','document-delivery',
  'electricity','plumbing','cleaning','air-conditioning','carpentry','appliance-repair',
  'mobile-car-wash','car-interior-deep-cleaning','car-battery-service',
  'electronics-repair','building-maintenance',
  'government-errands','documents-issuance','certified-translation','legal-services',
  'daily-worker','construction-worker','loading-worker','cleaning-worker',
  'pharmacy-purchase','purchase-and-delivery','seasonal-harvest','seasonal-plowing','seasonal-crop-transport',
  'shopping-for-me','custom-request'
];

test('V66.9: الكتالوج الموحد يحتفظ بكل الخدمات التاريخية والجديدة دون اختفاء', async () => {
  const t = await startApp();
  try {
    const rows = t.app.db.all<{slug:string}>('SELECT slug FROM services ORDER BY slug');
    const slugs = new Set(rows.map(x => x.slug));
    for (const slug of HISTORICAL_SERVICE_SLUGS) assert.ok(slugs.has(slug), `missing service: ${slug}`);
    assert.ok(slugs.size >= HISTORICAL_SERVICE_SLUGS.length);
  } finally { await t.close(); }
});

test('V66.9: ملفات الواجهة لا تعيد استخدام كاش قديم أو إصدار أصول أقدم', () => {
  const index = fs.readFileSync('public/index.html','utf8');
  const provider = fs.readFileSync('public/provider.html','utf8');
  const sw = fs.readFileSync('public/sw.js','utf8');
  assert.ok(index.includes('app.js?v=69.0'));
  assert.ok(provider.includes('app.js?v=69.0'));
  assert.ok(sw.includes('khadamat-shell-v69'));
  assert.ok(!sw.includes('khadamat-shell-v66_6'));
});
