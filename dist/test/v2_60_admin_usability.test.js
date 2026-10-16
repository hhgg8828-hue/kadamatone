import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync('public/app.ts', 'utf8');
const css = readFileSync('public/css/app.css', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');
test('الإشعارات المنبثقة تستعمل مساحة واحدة وتختفي سريعًا', () => {
    assert.match(app, /querySelector<HTMLElement>\('\.live-toast'\)/);
    assert.match(app, /setTimeout\(\(\)=>\{el\?\.classList\.remove\('live-toast-show'\)/);
    assert.match(app, /bottom:82px/);
    assert.match(css, /\.live-toast-host/);
});
test('محرر الخدمة لا يطلب من المسؤول كتابة JSON يدويًا', () => {
    assert.match(app, /أسئلة العميل \(اختياري\)/);
    assert.match(app, /id="addServiceField"/);
    assert.match(app, /data-schema-type/);
    assert.equal(/name="formSchema"/.test(app.slice(app.indexOf('function openServiceEditor('), app.indexOf('\nfunction openAreaEditor('))), false);
});
test('معرّفات الخدمات والأقسام تنشأ تلقائيًا من الأسماء', () => {
    assert.match(app, /function makeAdminSlug/);
    assert.match(app, /const rawSlug=makeAdminSlug\(String\(f\.get\('en'\)/);
    assert.match(app, /body\.slug=uniqueSlug/);
});
test('توصيات تأكيد الطلب تظهر كبطاقات أفقية مصورة وبها عرض الكل', () => {
    assert.match(app, /checkout-recommendation-rail/);
    assert.match(app, /checkout-recommendation-image/);
    assert.match(app, /button\.textContent='عرض الكل'/);
    assert.match(app, /data-checkout-extra=/);
});
test('الفلاتر تعتمد على المفضلة والتاريخ والمسافة الحقيقية', () => {
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /recentWindowMs:newServiceWindowMs/);
    assert.match(app, /locationAvailable:!!loc/);
    assert.match(app, /data-service-created=.*sv\.createdAt.*sv\.created_at/);
});
test('إشعارات الخلفية مدعومة عبر Push في Service Worker', () => {
    assert.match(serviceWorker, /addEventListener\('push'/);
    assert.match(serviceWorker, /showNotification\(title,options\)/);
});
//# sourceMappingURL=v2_60_admin_usability.test.js.map