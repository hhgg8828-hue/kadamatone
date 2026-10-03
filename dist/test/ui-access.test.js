import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const app = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'provider.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
test('customer shell exposes the provider portal', () => {
    assert.ok(app.includes('href="/provider.html"'));
    assert.ok(app.includes('واجهة مقدم الخدمة'));
});
test('provider auth exposes provider registration and customer switch', () => {
    assert.ok(app.includes("next==='provider'"));
    assert.ok(app.includes('إنشاء حساب مقدم خدمة'));
    assert.ok(app.includes('منصة مقدم الخدمة'));
});
test('provider page and frontend assets use the current version', () => {
    assert.ok(provider.includes('data-page="provider"'));
    assert.ok(provider.includes('app.js?v=59'));
    assert.ok(index.includes('app.js?v=59'));
});
test('provider order action is not nested inside the clickable order detail button', () => {
    assert.match(app, /class=\"order-card-main\"/);
    assert.equal(/<button class=\"card order-card\"[\s\S]*<span class=\"btn\" data-id=/.test(app), false);
});
test('provider portal does not redirect an existing customer back to the customer home', () => {
    assert.ok(app.includes("if(state.user!.role!=='PROVIDER')"));
    assert.ok(app.includes("authBox('provider');"));
    assert.ok(app.includes('هذا الحساب حساب عميل'));
    assert.ok(!app.includes("if(state.user!.role!=='PROVIDER'){location.href='/';return}"));
});
test('provider route alias serves the provider page', () => {
    const http = fs.readFileSync(path.join(root, '..', '..', 'src', 'core', 'http.ts'), 'utf8');
    assert.ok(http.includes("rel === '/provider' || rel === '/provider/'"));
    assert.ok(http.includes("rel = '/provider.html'"));
});
test('provider services UI shows only saved services and hides catalog until edit', () => {
    const src = app;
    assert.match(src, /myServicesList/);
    assert.match(src, /selected\.size\?allServices\.filter/);
    assert.match(src, /id="servicesEditor" style="display:none/);
    assert.match(src, /إضافة أو تعديل الخدمات/);
    assert.match(src, /await provider\(\)/);
});
test('admin dashboard exposes operational tabs and real actions', () => {
    assert.ok(app.includes('data-admin-tab="overview"'));
    assert.ok(app.includes('data-admin-tab="providers"'));
    assert.ok(app.includes('data-admin-tab="orders"'));
    assert.ok(app.includes('data-admin-tab="complaints"'));
    assert.ok(app.includes('data-admin-tab="users"'));
    assert.ok(app.includes('data-admin-tab="catalog"'));
    assert.ok(app.includes('data-admin-tab="areas"'));
    assert.ok(app.includes('data-admin-tab="settings"'));
    assert.ok(app.includes('/admin/catalog'));
    assert.ok(app.includes('/admin/services'));
    assert.ok(app.includes('/admin/categories'));
    assert.ok(app.includes('/admin/providers/'));
    assert.ok(app.includes('/admin/complaints/'));
    assert.ok(app.includes('/admin/users/'));
});
test('admin dashboard can inspect order history and complaint messages', () => {
    assert.ok(app.includes("/orders/'+encodeURIComponent(id)+'/history"));
    assert.ok(app.includes("/complaints/'+encodeURIComponent(id)"));
    assert.ok(app.includes('data-admin-order'));
    assert.ok(app.includes('data-admin-complaint'));
});
test('customer location center uses real saved-address APIs and supports address-based orders', () => {
    assert.ok(app.includes('id=\"myLocations\"'));
    assert.ok(app.includes('/me/addresses'));
    assert.ok(app.includes('data-delete-address'));
    assert.ok(app.includes('data-default-address'));
    assert.ok(app.includes('addressId'));
    assert.ok(app.includes('b.addressId=addressId'));
    assert.ok(app.includes('اختر عنوانًا محفوظًا أو حدّد موقعًا جديدًا.'));
});
test('customer location flow is GPS-first and auto-uses a previously granted permission', () => {
    assert.ok(app.includes('📍 إرسال موقعي الحالي'));
    assert.ok(app.includes("permissions.query({name:'geolocation'})"));
    assert.ok(app.includes("permission.state==='granted'"));
    assert.ok(app.includes("getElementById('useLocation') as HTMLButtonElement)?.click()"));
    assert.ok(app.includes('لا تحتاج لمعرفة الخريطة'));
});
test('provider navigation uses the exact customer coordinates', () => {
    assert.ok(app.includes("https://www.google.com/maps/dir/?api=1&destination="));
    assert.ok(app.includes('🧭 ابدأ الاتجاهات'));
    assert.ok(app.includes('موقع العميل'));
});
test('real-time SSE notifications are wired into customer/provider frontend', () => {
    assert.match(app, /\/events\/ticket/);
    assert.match(app, /new EventSource\('/);
    assert.match(app, /addEventListener\('notification'/);
});
test('V34 live operations: notification center, provider profile, and offer countdown', () => {
    assert.ok(app.includes('/notifications?limit=30'));
    assert.ok(app.includes('read-all'));
    assert.ok(app.includes("'/providers/'+encodeURIComponent(o.provider.id)"));
    assert.ok(app.includes('offer-countdown'));
    assert.ok(app.includes('startOfferCountdowns'));
});
test('V34 customer order card shows live provider and stage progress', () => {
    assert.ok(app.includes('order-progress'));
    assert.ok(app.includes('مقدم الخدمة في الطريق'));
    assert.ok(app.includes('اضغط لمتابعة الطلب'));
});
test('V35 customer complaint flow and saved-location editing are wired', () => {
    assert.ok(app.includes("/orders/'+encodeURIComponent(orderId)+'/complaint"));
    assert.ok(app.includes('newComplaintForm'));
    assert.ok(app.includes('complaintReplyForm'));
    assert.ok(app.includes('data-edit-address'));
    assert.ok(app.includes('editSavedAddress'));
});
test('V35 provider completion tools are wired', () => {
    assert.ok(app.includes('providerComplaintBtn'));
    assert.ok(app.includes('rateCustomer'));
    assert.ok(app.includes("/provider/orders/'+encodeURIComponent(id)+'/rate-customer"));
    assert.ok(app.includes('o.customer?.phone'));
});
test('V43: provider operational controls avoid shadowing the provider page function', () => {
    const source = fs.readFileSync('public/js/app.js', 'utf8');
    assert.match(source, /async function openProviderAreas\(providerData\)/);
    assert.match(source, /async function openProviderAvailability\(providerData\)/);
    assert.match(source, /id="selectAllDays"/);
    assert.match(source, /id="clearAllDays"/);
});
test('V43: notification modal has live refresh and actionable quote controls', () => {
    const source = fs.readFileSync('public/js/app.js', 'utf8');
    assert.match(source, /refreshOpenNotifications/);
    assert.match(source, /notification-accept-quote/);
    assert.match(source, /setInterval\(\(\) => refreshOpenNotifications\(\), 3000\)/);
});
test('V45: completed-order notification carries order context for the rating action', () => {
    const source = fs.readFileSync('public/js/app.js', 'utf8');
    assert.match(source, /n\.type === 'ORDER_COMPLETED'/);
    assert.match(source, /data-order-id=\"\$\{esc\(d\.orderId\)\}\"/);
    assert.match(source, /notification-order-action/);
    assert.match(source, /openRating\(orderId\)/);
});
test('V46: provider offer accept uses assignment id, not order id, and deduplicates by order', () => {
    const source = fs.readFileSync('public/js/app.js', 'utf8');
    assert.match(source, /uniqueBy\(/);
    assert.match(source, /String\(x\.orderId\)/);
    assert.match(source, /data-accept=\"\$\{esc\(x\.id\)\}\"/);
    assert.match(source, /encodeURIComponent\(b\.dataset\.accept/);
});
test('V46: customer rating opens a real star-rating screen and can detect an existing rating', () => {
    const source = fs.readFileSync('public/js/app.js', 'utf8');
    assert.match(source, /async function openRating\(id\)/);
    assert.match(source, /\/orders\/' \+ encodeURIComponent\(id\) \+ '\/rating/);
    assert.match(source, /class=\"rating-star\"/);
    assert.match(source, /تم تقييم الخدمة/);
});
test('V47: order chat UI exposes quick replies and live chat refresh hook', () => {
    const app = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
    assert.match(app, /CHAT_MESSAGE/);
    assert.match(app, /khadamat:chat/);
    assert.match(app, /اقتراحات سريعة/);
    assert.match(app, /أنا في الطريق/);
    assert.match(app, /أين وصلت؟/);
    assert.match(app, /data-chat-quick/);
    assert.match(css, /\.chat-bubble/);
    assert.match(css, /\.chat-quick-btn/);
});
test('V53: admin account settings and guarded offer acceptance are exposed', () => {
    const source = app;
    assert.match(source, /data-admin-tab="account">حسابي/);
    assert.match(source, /acceptingOffers/);
    assert.match(source, /جارٍ قبول الطلب/);
});
test('V49: provider can choose direct acceptance or quote, and admin complaint UI uses Arabic reply/closure workflow', () => {
    assert.ok(app.includes('قبول الطلب مباشرة'));
    assert.ok(app.includes('تقديم عرض سعر'));
    assert.ok(app.includes('رفض'));
    assert.ok(app.includes("/complaints/'+encodeURIComponent(c.id)+'/reply"));
    assert.ok(app.includes('إرسال الرد'));
    assert.ok(app.includes('إغلاق الشكوى وحفظ القرار'));
    assert.ok(app.includes('حل المشكلة وإبقاء الطلب مكتملًا'));
    assert.ok(!app.includes('RESTORE_COMPLETED أو CANCEL_ORDER أو WARN_PROVIDER'));
});
//# sourceMappingURL=ui-access.test.js.map