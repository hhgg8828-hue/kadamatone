import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appTs=fs.readFileSync(path.resolve('public/app.ts'),'utf8');

test('الواجهة النهائية: حسابي والإشعارات والتنقل موجودة في shell',()=>{
  assert.match(appTs,/id="accountBtn"/);
  assert.match(appTs,/openAccount\(\)/);
  assert.match(appTs,/openNotifications\(\)/);
});

test('مقدم الخدمة: إدارة المناطق وأوقات العمل مربوطة بالـAPI',()=>{
  assert.match(appTs,/id="editProviderAreas"/);
  assert.match(appTs,/id="editProviderAvailability"/);
  assert.match(appTs,/api\('\/provider\/areas'/);
  assert.match(appTs,/api\('\/provider\/availability'/);
});

test('الملفات الخاصة: عرض وثائق الإدارة يمر عبر جلسة المصادقة',()=>{
  assert.match(appTs,/data-admin-file/);
  assert.match(appTs,/openPrivateFile\(/);
  assert.equal(/data-admin-file=\"\$\{esc\(x\.fileUrl\)\}\"[^<]*href=/.test(appTs),false);
});
