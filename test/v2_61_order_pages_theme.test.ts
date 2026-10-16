import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts','utf8');
const css = readFileSync('public/css/app.css','utf8');
test('صفحة تتبع الطلب تعرض الرقم بجوار زر النسخ',()=>{
  assert.match(app, /tracking-reference-code-row"><h2><span>رقم الطلب<\/span> <bdi>#\$\{esc\(o\.code\)\}<\/bdi><\/h2><button class="tracking-copy-icon"/);
  assert.match(css, /\.tracking-reference-code-row\{direction:rtl!important;justify-content:center!important/);
});
test('صفحات تتبع الطلب تتبع المظهر النهاري والليلي',()=>{
  assert.match(css, /:root\[data-theme="light"\] body:has\(\.customer-shell\) #modal:has\(\.reference-tracking\)/);
  assert.match(css, /:root\[data-theme="dark"\] body:has\(\.customer-shell\) #modal:has\(\.reference-tracking\)/);
});
test('بطاقات طلباتي تتضمن رقمًا ظاهرًا ونسخًا وتكرارًا للطلب غير النشط',()=>{
  assert.match(app, /data-copy-order-code="\$\{esc\(o\.code\)\}"/);
  assert.match(app, /تكرار الطلب　⇄/);
  assert.match(css, /\.order-card-total-row/);
});
