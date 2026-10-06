import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const appTs = fs.readFileSync(path.resolve('public/app.ts'), 'utf8');
test('الواجهة النهائية: حسابي والإشعارات والتنقل موجودة في shell', () => {
    assert.match(appTs, /id="accountBtn"/);
    assert.match(appTs, /openAccount\(\)/);
    assert.match(appTs, /openNotifications\(\)/);
});
test('مقدم الخدمة: إدارة المناطق وأوقات العمل مربوطة بالـAPI', () => {
    assert.match(appTs, /id="editProviderAreas"/);
    assert.match(appTs, /id="editProviderAvailability"/);
    assert.match(appTs, /api\('\/provider\/areas'/);
    assert.match(appTs, /api\('\/provider\/availability'/);
});
test('الملفات الخاصة: عرض وثائق الإدارة يمر عبر جلسة المصادقة', () => {
    assert.match(appTs, /data-admin-file/);
    assert.match(appTs, /openPrivateFile\(/);
    assert.equal(/data-admin-file=\"\$\{esc\(x\.fileUrl\)\}\"[^<]*href=/.test(appTs), false);
});
test('V75: سهولة الاستخدام ومركز التنبيهات لا يحجبان رأس الصفحة', () => {
    assert.match(appTs, /A11Y_KEYS/);
    assert.match(appTs, /a11yLargeText/);
    assert.match(appTs, /a11yHighContrast/);
    assert.match(appTs, /a11yReduceMotion/);
    assert.match(appTs, /bottom:82px/);
});
test('V75: المستفيدون يدعمون حفظ موقع ووصف وصول اختياري', () => {
    assert.match(appTs, /beneficiaryUseLocation/);
    assert.match(appTs, /landmarkText/);
    assert.match(appTs, /accessNotes/);
    assert.match(appTs, /body\.location/);
});
//# sourceMappingURL=final-complete-ui.test.js.map