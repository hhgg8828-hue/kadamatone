import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('V83.3: تحديث العميل يحافظ على قسم الطلبات وموضع التمرير', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.match(app, /previousOrdersVisible/);
    assert.match(app, /previousScrollY/);
    assert.match(app, /if\(previousOrdersVisible\)switchCustomerSection\('orders'\)/);
    assert.match(app, /window\.scrollTo\(\{top:previousScrollY,behavior:'auto'\}\)/);
});
test('V83.3: اتصال مقدم الخدمة يعيد مطابقة الطلبات المفتوحة فورًا', () => {
    const providers = fs.readFileSync('src/modules/providers.ts', 'utf8');
    assert.match(providers, /if \(online\) app\.assignment\.offerOpenOrdersToProvider\(pid\(ctx\)\)/);
});
test('V83.3: صفحة المشوار لا تحتوي حقول الغرض والشراء والملاحظات القديمة', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const section = app.slice(app.indexOf('async function openMotorcycleTripForm'), app.indexOf('async function openOrderFormBySlug'));
    for (const gone of ['purchaseDetailsCard', 'tripPurpose', 'tripOriginNote', 'tripDestinationNote', 'tripNotes', 'purchaseMaxPrice'])
        assert.equal(section.includes(gone), false, gone);
    assert.match(section, /class="tt-when"/);
});
test('V83.3: أصول الصفحات وكاش الخدمة يستخدمان الإصدار الجديد', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        assert.ok(fs.readFileSync(file, 'utf8').includes(`app.js?v=${JSON.parse(fs.readFileSync('package.json', 'utf8')).version}`), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').match(/khadamat-shell-v\d+-\d+/));
});
test('V83.3: شاشة تتبع الطلب ترسم مسار GPS فعليًا وتحدّثه حيًا', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const start = app.indexOf('async function openTripTracking');
    const end = app.indexOf('async function ', start + 10);
    const tracking = app.slice(start, end > start ? end : undefined);
    assert.match(tracking, /L\.polyline\(coords/);
    assert.match(tracking, /khadamat:trip-location/);
    assert.match(tracking, /setInterval\(async\(\)=>/);
    assert.match(tracking, /لم يتوفر بعد عدد كافٍ من نقاط GPS/);
});
//# sourceMappingURL=v83_3_customer_journey.test.js.map