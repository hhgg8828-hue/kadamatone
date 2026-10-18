import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const frontend = fs.readFileSync('public/app.ts', 'utf8');
const serviceWorker = fs.readFileSync('public/sw.js', 'utf8');
const platform = fs.readFileSync('src/modules/platform.ts', 'utf8');
test('modal dialogs expose dialog semantics and an accessible name', () => {
    assert.match(frontend, /role="dialog" aria-modal="true" aria-label="نافذة حوار"/);
    assert.match(frontend, /aria-labelledby/);
    assert.match(frontend, /إغلاق النافذة/);
    assert.match(frontend, /وضع الاختبار: رمز دخول تجريبي جاهز تلقائيًا؛ لا تُرسل رسالة واتساب ولا يتم التحقق من ملكية الرقم/);
});
test('modal keyboard interaction supports Escape and traps Tab focus', () => {
    assert.match(frontend, /key==='Escape'/);
    assert.match(frontend, /key!=='Tab'/);
    assert.match(frontend, /e\.shiftKey&&document\.activeElement===first/);
    assert.match(frontend, /document\.activeElement===last/);
});
test('closing a modal restores focus to its opener', () => {
    assert.match(frontend, /modalReturnFocus=returnFocus/);
    assert.match(frontend, /target\?\.isConnected\)target\.focus\(\)/);
});
test('platform and service worker advertise the 2.95 release', () => {
    assert.match(platform, /appVersion: '2\.95'/);
    assert.match(serviceWorker, /khadamat-shell-v2-95/);
});
//# sourceMappingURL=v2_93_modal_accessibility_and_staging_otp.test.js.map