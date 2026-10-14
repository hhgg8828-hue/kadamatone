import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
test('customer back returns from orders tab to services before exit prompt', () => {
  assert.match(app, /ordersSection[\s\S]*switchCustomerSection\('services'\)[\s\S]*هل أنت متأكد أنك تريد الخروج من التطبيق/);
});
test('trip offline fallback uses configured admin SMS phone and explicit manual-send warning', () => {
  assert.match(app, /state\.config\?\.adminSmsPhone/);
  assert.match(app, /طلب مشوار جديد — خدمات/);
  assert.match(app, /اضغط إرسال بنفسك؛ الطلب غير مؤكد أو مسجل حتى تراجعه الإدارة/);
});
