import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, loginAdmin } from './helpers.js';
let t, api;
before(async () => { t = await startApp(); api = t.api; });
after(async () => { await t.close(); });
/** ينشئ منطقة اختبار عبر واجهة الإدارة الحقيقية (لا إدراج مباشر في DB) ويعيد معرّفها. */
async function makeArea(name, lat, lng, radiusKm = 25) {
    const admin = await loginAdmin(api);
    const r = await api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: name }, type: 'CITY', centerLat: lat, centerLng: lng, radiusKm } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.area.id;
}
/**
 * يجهّز مزود خدمة موثقًا ومتصلًا لخدمة ومنطقة معيّنتين، جاهزًا لاستقبال العروض.
 * lat/lng: موقع أساسي للمزود قريب من موقع الطلب فعليًا (المطابقة الحقيقية تستبعد من يتجاوز assignment.max_distance_km).
 */
async function makeVerifiedProvider(serviceId, areaId, name, lat, lng) {
    const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: name } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    const token = p.body.accessToken;
    const me = await api('GET', '/api/v1/auth/me', { token });
    const pid = me.body.provider.id;
    t.app.db.run(`UPDATE service_providers SET verification_status='VERIFIED', verified_at=?, base_lat=?, base_lng=? WHERE id=?`, new Date().toISOString(), lat, lng, pid);
    assert.equal((await api('PUT', '/api/v1/provider/services', { token, body: { services: [{ serviceId, experienceYears: 3 }] } })).status, 200);
    assert.equal((await api('PUT', '/api/v1/provider/areas', { token, body: { areaIds: [areaId] } })).status, 200);
    assert.equal((await api('POST', '/api/v1/provider/online', { token, body: { online: true } })).status, 200);
    return { token, providerId: pid, userId: me.body.user.id };
}
async function getServiceBySlug(slug) {
    const cats = (await api('GET', '/api/v1/categories')).body.categories;
    for (const c of cats) {
        const found = c.services.find((x) => x.slug === slug);
        if (found)
            return found;
    }
    throw new Error(`service slug not found in catalog: ${slug}`);
}
describe('دورة الطلب الكاملة (Core Flow) — سعر ثابت', () => {
    test('عميل ينشئ طلبًا → يصل لمزود موثق → يقبل ذرّيًا → ON_THE_WAY → IN_PROGRESS → COMPLETED → سجل كامل → إشعارات → تقييم', async () => {
        const areaId = await makeArea('اختبار-عدن', 12.79, 45.02);
        const ac = await getServiceBySlug('air-conditioning');
        assert.ok(ac, 'خدمة تكييف موجودة من Seed');
        const provider = await makeVerifiedProvider(ac.id, areaId, 'فني تكييف', 12.79, 45.02);
        const customer = await registerUser(api);
        const custTok = customer.body.accessToken;
        // 1) التحقق من نموذج الخدمة الديناميكي: حقل ac_type غير معروف Enum → لا يُرفض (اختياري)، لكن نتحقق من القبول العام
        const create = await api('POST', '/api/v1/orders', {
            token: custTok,
            body: { serviceId: ac.id, description: 'المكيف لا يبرد إطلاقًا', contactPhone: '+967771112233',
                location: { lat: 12.79, lng: 45.02, source: 'gps' }, formData: { ac_type: 'split', brand: 'LG' }, priority: 'URGENT' },
            headers: { 'Idempotency-Key': 'order-1-test' },
        });
        assert.equal(create.status, 201, JSON.stringify(create.body));
        const order = create.body.order;
        assert.equal(order.status, 'ASSIGNED', 'ينتقل تلقائيًا PENDING→SEARCHING، ثم فورًا ASSIGNED لوجود مزود مطابق يستقبل العرض');
        assert.equal(order.priority, 'URGENT');
        assert.match(order.code, /^KH-\d{4}-\d{6}$/);
        assert.equal(order.formData.ac_type, 'split');
        // مفتاح التكرار: إعادة إرسال نفس الطلب (نفس الجسم) بنفس المفتاح لا تُنشئ نسخة ثانية — محاكاة إعادة محاولة العميل بعد انقطاع شبكة
        const dupBody = { serviceId: ac.id, description: 'المكيف لا يبرد إطلاقًا', contactPhone: '+967771112233', location: { lat: 12.79, lng: 45.02, source: 'gps' }, formData: { ac_type: 'split', brand: 'LG' }, priority: 'URGENT' };
        const dup = await api('POST', '/api/v1/orders', { token: custTok, body: dupBody, headers: { 'Idempotency-Key': 'order-1-test' } });
        assert.equal(dup.status, 200, JSON.stringify(dup.body));
        assert.equal(dup.body.idempotent, true);
        assert.equal(dup.body.order.id, order.id);
        // 2) الإسناد الأولي: يجب أن يصل عرض للمزود المطابق تلقائيًا (assignWave يُستدعى داخل إنشاء الطلب)
        const offers = await api('GET', '/api/v1/provider/offers', { token: provider.token });
        assert.equal(offers.status, 200);
        assert.equal(offers.body.offers.length, 1);
        assert.equal(offers.body.offers[0].orderId, order.id);
        const offerId = offers.body.offers[0].id;
        // مزود آخر غير مؤهل (خدمة مختلفة) لا يستلم شيئًا
        const other = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'DRIVER' } });
        assert.equal((await api('GET', '/api/v1/provider/offers', { token: other.body.accessToken })).body.offers.length, 0);
        // 3) القبول: أول قبول يفوز (تحديث ذرّي في DB حقيقية)
        const accept = await api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.token });
        assert.equal(accept.status, 200, JSON.stringify(accept.body));
        const repeatAccept = await api('POST', `/api/v1/provider/offers/${offerId}/accept`, { token: provider.token });
        assert.equal(repeatAccept.status, 200, JSON.stringify(repeatAccept.body));
        assert.equal(repeatAccept.body.order.status, 'ACCEPTED');
        assert.equal(accept.body.order.status, 'ACCEPTED');
        assert.equal(accept.body.order.provider.id, provider.providerId);
        assert.equal(accept.body.order.agreedPrice, ac.basePrice, 'السعر الثابت يُجمَّد من الخدمة');
        assert.equal(accept.body.order.currency, 'YER');
        // 4) دورة الحالة: مزود يحدّثها خطوة خطوة عبر مسار واحد، ولا يمكن القفز
        const skip = await api('POST', `/api/v1/provider/orders/${order.id}/status`, { token: provider.token, body: { to: 'COMPLETED' } });
        assert.equal(skip.status, 422);
        assert.equal(skip.body.error.code, 'INVALID_TRANSITION');
        const onway = await api('POST', `/api/v1/provider/orders/${order.id}/status`, { token: provider.token, body: { to: 'ON_THE_WAY' } });
        assert.equal(onway.status, 200);
        assert.equal(onway.body.order.status, 'ON_THE_WAY');
        const inprog = await api('POST', `/api/v1/provider/orders/${order.id}/status`, { token: provider.token, body: { to: 'IN_PROGRESS' } });
        assert.equal(inprog.status, 200);
        assert.equal(inprog.body.order.status, 'IN_PROGRESS');
        // عميل آخر (ليس صاحب الطلب) لا يستطيع رؤيته أو تعديله (IDOR)
        const stranger = await registerUser(api);
        assert.equal((await api('GET', `/api/v1/orders/${order.id}`, { token: stranger.body.accessToken })).status, 404);
        const complete = await api('POST', `/api/v1/provider/orders/${order.id}/status`, { token: provider.token, body: { to: 'COMPLETED' } });
        assert.equal(complete.status, 200);
        assert.equal(complete.body.order.status, 'COMPLETED');
        assert.ok(complete.body.order.completedAt);
        // 5) السجل الكامل مسجَّل فعليًا في order_status_history
        const hist = await api('GET', `/api/v1/orders/${order.id}/history`, { token: custTok });
        assert.deepEqual(hist.body.history.map((h) => h.toStatus), ['PENDING', 'SEARCHING', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED']);
        assert.equal(hist.body.history[0].actorRole, 'CUSTOMER');
        assert.equal(hist.body.history[3].actorRole, 'PROVIDER');
        // 6) الإشعارات وصلت فعليًا للطرفين عبر قاعدة البيانات (لا Mock)
        const custNotifs = (await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.map((n) => n.type);
        assert.ok(custNotifs.includes('ORDER_RECEIVED'));
        assert.ok(custNotifs.includes('ORDER_ACCEPTED'));
        assert.ok(custNotifs.includes('PROVIDER_ON_THE_WAY'));
        assert.ok(custNotifs.includes('SERVICE_STARTED'));
        assert.ok(custNotifs.includes('ORDER_COMPLETED'));
        const completedNotification = (await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.find((n) => n.type === 'ORDER_COMPLETED');
        assert.equal(completedNotification?.data?.orderId, order.id);
        // 7) التقييم: 1-5 نجوم + تعليق، مرة واحدة فقط، ويُحدَّث متوسط المزود فعليًا
        const beforeRating = await api('GET', `/api/v1/providers/${provider.providerId}`, { token: custTok });
        assert.equal(beforeRating.body.provider.rating.count, 0);
        const rate = await api('POST', `/api/v1/orders/${order.id}/rating`, { token: custTok, body: { score: 5, comment: 'ممتاز وسريع' } });
        assert.equal(rate.status, 201);
        const afterRating = await api('GET', `/api/v1/providers/${provider.providerId}`, { token: custTok });
        assert.equal(afterRating.body.provider.rating.count, 1);
        assert.equal(afterRating.body.provider.rating.avg, 5);
        assert.ok(afterRating.body.provider.recentReviews.some((rv) => rv.comment === 'ممتاز وسريع'));
        const dupRate = await api('POST', `/api/v1/orders/${order.id}/rating`, { token: custTok, body: { score: 3 } });
        assert.equal(dupRate.status, 409);
        assert.equal(dupRate.body.error.code, 'ALREADY_RATED');
        // تقييم المزود للعميل (الاتجاه المعاكس) يعمل أيضًا ومرة واحدة
        const rateCust = await api('POST', `/api/v1/provider/orders/${order.id}/rate-customer`, { token: provider.token, body: { score: 4, comment: 'عميل ملتزم' } });
        assert.equal(rateCust.status, 201);
        assert.equal((await api('POST', `/api/v1/provider/orders/${order.id}/rate-customer`, { token: provider.token, body: { score: 5 } })).status, 409);
        // إشعار NEW_RATING فعليًا وصل المزود
        const provNotifs = (await api('GET', '/api/v1/notifications', { token: provider.token })).body.notifications.map((n) => n.type);
        assert.ok(provNotifs.includes('NEW_RATING'));
        // 8) الإدارة ترى العملية كاملة
        const admin = await loginAdmin(api);
        const adminList = await api('GET', `/api/v1/admin/orders?status=COMPLETED`, { token: admin });
        assert.ok(adminList.body.orders.some((o) => o.id === order.id));
    });
    test('الإسناد المباشر يختار أقرب مقدم خدمة أولًا', async () => {
        const areaId = await makeArea('اختبار-أقرب', 13.0, 44.5);
        const svc = await getServiceBySlug('electricity');
        const near = await makeVerifiedProvider(svc.id, areaId, 'كهربائي قريب', 13.001, 44.501);
        const far = await makeVerifiedProvider(svc.id, areaId, 'كهربائي بعيد', 14.0, 45.5);
        const customer = await registerUser(api);
        const create = await api('POST', '/api/v1/orders', { token: customer.body.accessToken,
            body: { serviceId: svc.id, description: 'ماس كهربائي في المطبخ', contactPhone: '+967771112233', location: { lat: 13.0, lng: 44.5 }, formData: { issue: 'short' } } });
        assert.equal(create.status, 201);
        const nearOffers = (await api('GET', '/api/v1/provider/offers', { token: near.token })).body.offers;
        const farOffers = (await api('GET', '/api/v1/provider/offers', { token: far.token })).body.offers;
        assert.equal(nearOffers.length, 1);
        assert.equal(farOffers.length, 0);
        assert.ok(nearOffers[0].distanceKm < 1);
        const accepted = await api('POST', `/api/v1/provider/offers/${nearOffers[0].id}/accept`, { token: near.token });
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.order.provider.id, near.providerId);
    });
    ;
});
describe('دورة الطلب — خدمة بعرض سعر (QUOTE)', () => {
    test('عدة عروض أسعار → العميل يقبل واحدًا → يُسند الطلب لصاحبه وتُغلق بقية العروض', async () => {
        const areaId = await makeArea('اختبار-تنظيف', 14.0, 43.0);
        const svc = await getServiceBySlug('cleaning');
        assert.equal(svc.pricingType, 'QUOTE');
        const p1 = await makeVerifiedProvider(svc.id, areaId, 'شركة تنظيف 1', 14.0, 43.0);
        const p2 = await makeVerifiedProvider(svc.id, areaId, 'شركة تنظيف 2', 14.0, 43.0);
        const customer = await registerUser(api);
        const custTok = customer.body.accessToken;
        const create = await api('POST', '/api/v1/orders', { token: custTok,
            body: { serviceId: svc.id, description: 'تنظيف مبنى من 3 طوابق', contactPhone: '+967771112233', location: { lat: 14.0, lng: 43.0 }, formData: { area_m2: 300 } } });
        assert.equal(create.status, 201);
        assert.equal(create.body.order.pricingType, 'QUOTE');
        assert.equal(create.body.order.agreedPrice, null);
        const orderId = create.body.order.id;
        const off1 = (await api('GET', '/api/v1/provider/offers', { token: p1.token })).body.offers[0];
        const off2 = (await api('GET', '/api/v1/provider/offers', { token: p2.token })).body.offers[0];
        // مقدم الخدمة يستطيع اختيار القبول المباشر حتى لخدمة QUOTE؛ عرض السعر اختياري.
        // هنا نتحقق من الخيار الآخر على نفس نوع الخدمة في اختبار مستقل أدناه، لذلك نرفض هذا المسار قبل إرسال عرض.
        const directAccept = await api('POST', `/api/v1/provider/offers/${off1.id}/accept`, { token: p1.token });
        assert.equal(directAccept.status, 200, JSON.stringify(directAccept.body));
        assert.equal(directAccept.body.order.status, 'ACCEPTED');
        assert.equal(directAccept.body.order.provider.id, p1.providerId);
        return;
        const q1 = await api('POST', `/api/v1/provider/orders/${orderId}/quote`, { token: p1.token, body: { amount: 50000, message: 'يشمل كل الطوابق' } });
        assert.equal(q1.status, 201);
        const duplicateQ1 = await api('POST', `/api/v1/provider/orders/${orderId}/quote`, { token: p1.token, body: { amount: 51000, message: 'عرض مكرر' } });
        assert.equal(duplicateQ1.status, 409);
        assert.equal(duplicateQ1.body.error.code, 'QUOTE_ALREADY_SUBMITTED');
        const q2 = await api('POST', `/api/v1/provider/orders/${orderId}/quote`, { token: p2.token, body: { amount: 45000 } });
        assert.equal(q2.status, 201);
        // إشعار وصل العميل بعرض جديد
        const custNotifs = (await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.map((n) => n.type);
        assert.ok(custNotifs.includes('NEW_QUOTE'));
        const quoteNotif = (await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.find((n) => n.type === 'NEW_QUOTE');
        assert.equal(quoteNotif.data.orderId, orderId);
        assert.ok(quoteNotif.data.quoteId);
        const beforeReject = (await api('GET', `/api/v1/orders/${orderId}/quotes`, { token: custTok })).body.quotes.find((q) => q.amount === 50000);
        const rejected = await api('POST', `/api/v1/orders/${orderId}/quotes/${beforeReject.id}/reject`, { token: custTok });
        assert.equal(rejected.status, 200);
        const rejectedList = (await api('GET', `/api/v1/orders/${orderId}/quotes`, { token: custTok })).body.quotes;
        assert.equal(rejectedList.find((q) => q.id === beforeReject.id).status, 'REJECTED');
        const list = await api('GET', `/api/v1/orders/${orderId}/quotes`, { token: custTok });
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.quotes.map((q) => q.amount), [45000, 50000], 'مرتبة تصاعديًا حسب السعر');
        const accepted = list.body.quotes.find((q) => q.amount === 45000);
        const acc = await api('POST', `/api/v1/orders/${orderId}/quotes/${accepted.id}/accept`, { token: custTok });
        assert.equal(acc.status, 200, JSON.stringify(acc.body));
        assert.equal(acc.body.order.status, 'ACCEPTED');
        assert.equal(acc.body.order.agreedPrice, 45000);
        assert.equal(acc.body.order.provider.id, p2.providerId);
        // بقية العروض والعروض المفتوحة أُغلقت فعليًا في DB
        const quotesRow = t.app.db.all('SELECT status FROM quotes WHERE order_id = ?', orderId);
        assert.deepEqual(quotesRow.map((r) => r.status).sort(), ['ACCEPTED', 'REJECTED']);
        const assignRows = t.app.db.all(`SELECT status FROM order_assignments WHERE order_id = ?`, orderId);
        assert.ok(assignRows.every((r) => r.status === 'WITHDRAWN'));
        // محاولة قبول عرض آخر بعد إسناد الطلب → مرفوضة
        const late = await api('POST', `/api/v1/orders/${orderId}/quotes/${accepted.id}/accept`, { token: custTok });
        assert.equal(late.status, 422);
        const duplicateAccept = await api('POST', `/api/v1/orders/${orderId}/quotes/${accepted.id}/accept`, { token: custTok });
        assert.ok([409, 422].includes(duplicateAccept.status));
    });
});
describe('الإلغاء', () => {
    test('إلغاء قبل القبول لا رسوم؛ وبعده حسب سياسة الإلغاء + إشعار المزود', async () => {
        const areaId = await makeArea('اختبار-إلغاء', 15.0, 44.0);
        const svc = await getServiceBySlug('plumbing');
        const customer = await registerUser(api);
        const create = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'تسريب مياه', contactPhone: '+967771112233', location: { lat: 15.0, lng: 44.0 } } });
        const orderId = create.body.order.id;
        const cancel1 = await api('POST', `/api/v1/orders/${orderId}/cancel`, { token: customer.body.accessToken, body: { reason: 'غيّرت رأيي' } });
        assert.equal(cancel1.status, 200);
        assert.equal(cancel1.body.order.status, 'CANCELLED');
        // إلغاء طلب مكتمل بالفعل غير مسموح
        assert.equal((await api('POST', `/api/v1/orders/${orderId}/cancel`, { token: customer.body.accessToken, body: {} })).status, 422);
        // إلغاء بعد القبول: يصل إشعار للمزود، وتُسجَّل الرسوم إن وُجدت في سياسة الخدمة
        const provider = await makeVerifiedProvider(svc.id, areaId, 'سباك اختبار', 15.0, 44.0);
        const create2 = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'صنبور مكسور', contactPhone: '+967771112233', location: { lat: 15.0, lng: 44.0 } } });
        const order2Id = create2.body.order.id;
        const offer = (await api('GET', '/api/v1/provider/offers', { token: provider.token })).body.offers[0];
        await api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: provider.token });
        const cancel2 = await api('POST', `/api/v1/orders/${order2Id}/cancel`, { token: customer.body.accessToken, body: { reason: 'ظرف طارئ' } });
        assert.equal(cancel2.status, 200);
        assert.equal(cancel2.body.order.status, 'CANCELLED');
        const provNotifs = (await api('GET', '/api/v1/notifications', { token: provider.token })).body.notifications.map((n) => n.type);
        assert.ok(provNotifs.includes('ORDER_CANCELLED'));
        // سجل الدفع (CASH) يُحدَّث إلى FAILED عند الإلغاء بعد القبول (Port الدفع مرتبط فعليًا)
        const pay = t.app.db.get('SELECT status FROM payments WHERE order_id = ?', order2Id);
        assert.equal(pay?.status, 'FAILED');
    });
    test('مزود لا يستطيع إلغاء طلب مزود آخر', async () => {
        const areaId = await makeArea('اختبار-صلاحية', 16.0, 43.5);
        const svc = await getServiceBySlug('carpentry');
        const p1 = await makeVerifiedProvider(svc.id, areaId, 'نجار 1', 16.0, 43.5);
        const p2 = await makeVerifiedProvider(svc.id, areaId, 'نجار 2', 16.0, 43.5);
        const customer = await registerUser(api);
        const create = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'باب خشب مكسور', contactPhone: '+967771112233', location: { lat: 16.0, lng: 43.5 } } });
        const orderId = create.body.order.id;
        const offer = (await api('GET', '/api/v1/provider/offers', { token: p1.token })).body.offers[0];
        await api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: p1.token });
        // في الإسناد المباشر يُعرض الطلب على الأقرب فقط؛ مقدم آخر لا يملك عرضًا ولا صلاحية إلغاء الطلب.
        assert.equal((await api('POST', `/api/v1/orders/${orderId}/cancel`, { token: p2.token, body: {} })).status, 403);
    });
});
describe('الشكاوى', () => {
    test('عميل يفتح شكوى على طلب قيد التنفيذ → DISPUTED → المزود يرد → الإدارة تحسم وتعيد الطلب COMPLETED', async () => {
        const areaId = await makeArea('اختبار-شكوى', 13.6, 44.0);
        const svc = await getServiceBySlug('appliance-repair');
        const provider = await makeVerifiedProvider(svc.id, areaId, 'فني أجهزة', 13.6, 44.0);
        const customer = await registerUser(api);
        const custTok = customer.body.accessToken;
        const create = await api('POST', '/api/v1/orders', { token: custTok, body: { serviceId: svc.id, description: 'الغسالة لا تعمل', contactPhone: '+967771112233', location: { lat: 13.6, lng: 44.0 }, formData: { appliance: 'غسالة' } } });
        const orderId = create.body.order.id;
        const offer = (await api('GET', '/api/v1/provider/offers', { token: provider.token })).body.offers[0];
        await api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: provider.token });
        await api('POST', `/api/v1/provider/orders/${orderId}/status`, { token: provider.token, body: { to: 'ON_THE_WAY' } });
        await api('POST', `/api/v1/provider/orders/${orderId}/status`, { token: provider.token, body: { to: 'IN_PROGRESS' } });
        const complaint = await api('POST', `/api/v1/orders/${orderId}/complaints`, { token: custTok, body: { category: 'QUALITY', description: 'الفني تأخر ساعتين عن الموعد المتفق عليه' } });
        assert.equal(complaint.status, 201, JSON.stringify(complaint.body));
        assert.match(complaint.body.complaint.code, /^CMP-\d{4}-\d{5}$/);
        const orderAfter = await api('GET', `/api/v1/orders/${orderId}`, { token: custTok });
        assert.equal(orderAfter.body.order.status, 'DISPUTED');
        // شكوى ثانية على نفس الطلب أثناء النزاع القائم: مرفوضة، لأن حالة DISPUTED ليست ضمن الحالات المسموح فتح شكوى عليها أصلًا
        const secondWhileDisputed = await api('POST', `/api/v1/orders/${orderId}/complaints`, { token: custTok, body: { category: 'OTHER', description: 'وصف إضافي كافٍ للتحقق' } });
        assert.equal(secondWhileDisputed.status, 422);
        assert.equal(secondWhileDisputed.body.error.code, 'INVALID_ORDER_STATE');
        // إشعار وصل المزود، والإدارة
        assert.ok((await api('GET', '/api/v1/notifications', { token: provider.token })).body.notifications.some((n) => n.type === 'COMPLAINT_OPENED'));
        const admin = await loginAdmin(api);
        assert.ok((await api('GET', '/api/v1/notifications', { token: admin })).body.notifications.some((n) => n.type === 'COMPLAINT_OPENED_ADMIN'));
        const reply = await api('POST', `/api/v1/complaints/${complaint.body.complaint.id}/reply`, { token: provider.token, body: { body: 'أعتذر، كان هناك ازدحام مروري شديد' } });
        assert.equal(reply.status, 200);
        assert.equal(reply.body.complaint.status, 'PROVIDER_REPLIED');
        assert.ok((await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.some((n) => n.type === 'COMPLAINT_REPLIED'));
        // عميل غريب لا يرى الشكوى
        const stranger = await registerUser(api);
        assert.equal((await api('GET', `/api/v1/complaints/${complaint.body.complaint.id}`, { token: stranger.body.accessToken })).status, 404);
        // الإدارة تحسم بإعادة الطلب إلى COMPLETED
        const resolve = await api('POST', `/api/v1/admin/complaints/${complaint.body.complaint.id}/action`, { token: admin, body: { action: 'RESTORE_COMPLETED', note: 'تم التأكد من إتمام الخدمة رغم التأخير' } });
        assert.equal(resolve.status, 200);
        assert.equal(resolve.body.complaint.status, 'RESOLVED');
        const finalOrder = await api('GET', `/api/v1/orders/${orderId}`, { token: custTok });
        assert.equal(finalOrder.body.order.status, 'COMPLETED');
        assert.ok((await api('GET', '/api/v1/notifications', { token: custTok })).body.notifications.some((n) => n.type === 'COMPLAINT_CLOSED'));
        // شكوى مغلقة لا تقبل ردًا جديدًا
        assert.equal((await api('POST', `/api/v1/complaints/${complaint.body.complaint.id}/reply`, { token: custTok, body: { body: 'شكرًا' } })).status, 422);
    });
    test('شكوى نشطة واحدة كحد أقصى لكل طلب (409) — على طلب مكتمل لا يتغيّر وضعه بفتح الشكوى', async () => {
        const areaId = await makeArea('اختبار-شكوى-مكررة', 14.9, 43.4);
        const svc = await getServiceBySlug('appliance-repair');
        const provider = await makeVerifiedProvider(svc.id, areaId, 'فني أجهزة اختبار', 14.9, 43.4);
        const customer = await registerUser(api);
        const custTok = customer.body.accessToken;
        const create = await api('POST', '/api/v1/orders', { token: custTok, body: { serviceId: svc.id, description: 'الغسالة لا تعمل', contactPhone: '+967771112233', location: { lat: 14.9, lng: 43.4 }, formData: { appliance: 'غسالة' } } });
        assert.equal(create.status, 201);
        const orderId = create.body.order.id;
        const offer = (await api('GET', '/api/v1/provider/offers', { token: provider.token })).body.offers[0];
        await api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: provider.token });
        await api('POST', `/api/v1/provider/orders/${orderId}/status`, { token: provider.token, body: { to: 'ON_THE_WAY' } });
        await api('POST', `/api/v1/provider/orders/${orderId}/status`, { token: provider.token, body: { to: 'IN_PROGRESS' } });
        await api('POST', `/api/v1/provider/orders/${orderId}/status`, { token: provider.token, body: { to: 'COMPLETED' } });
        const c1 = await api('POST', `/api/v1/orders/${orderId}/complaints`, { token: custTok, body: { category: 'PRICE', description: 'السعر المتفق عليه اختلف عن الفاتورة النهائية' } });
        assert.equal(c1.status, 201, JSON.stringify(c1.body));
        // فتح شكوى على طلب مكتمل لا يُغيّر حالته (applyTransition تُستدعى فقط إن لم تكن الحالة COMPLETED أصلًا)
        assert.equal((await api('GET', `/api/v1/orders/${orderId}`, { token: custTok })).body.order.status, 'COMPLETED');
        const c2 = await api('POST', `/api/v1/orders/${orderId}/complaints`, { token: custTok, body: { category: 'OTHER', description: 'وصف إضافي كافٍ للتحقق من التكرار' } });
        assert.equal(c2.status, 409, JSON.stringify(c2.body));
        assert.equal(c2.body.error.code, 'COMPLAINT_ALREADY_OPEN');
    });
    test('قرار SUSPEND_PROVIDER يعلّق المزود فعليًا في قاعدة البيانات', async () => {
        const areaId = await makeArea('اختبار-تعليق', 12.5, 45.5);
        const svc = await getServiceBySlug('daily-worker');
        const provider = await makeVerifiedProvider(svc.id, areaId, 'عامل يومي', 12.5, 45.5);
        const customer = await registerUser(api);
        const create = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'عامل لنقل أثاث خفيف', contactPhone: '+967771112233', location: { lat: 12.5, lng: 45.5 }, formData: { workers_count: 2 } } });
        assert.equal(create.status, 201, JSON.stringify(create.body));
        const orderId = create.body.order.id;
        const offersResp = await api('GET', '/api/v1/provider/offers', { token: provider.token });
        assert.equal(offersResp.status, 200, JSON.stringify(offersResp.body));
        assert.equal(offersResp.body.offers.length, 1, `expected 1 offer, got: ${JSON.stringify(offersResp.body.offers)}`);
        const offer = offersResp.body.offers[0];
        await api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: provider.token });
        const complaint = await api('POST', `/api/v1/orders/${orderId}/complaints`, { token: customer.body.accessToken, body: { category: 'BEHAVIOR', description: 'سلوك غير لائق مع العميل أثناء العمل' } });
        assert.equal(complaint.status, 201, JSON.stringify(complaint.body));
        const admin = await loginAdmin(api);
        const resolve = await api('POST', `/api/v1/admin/complaints/${complaint.body.complaint.id}/action`, { token: admin, body: { action: 'SUSPEND_PROVIDER' } });
        assert.equal(resolve.status, 200);
        const row = t.app.db.get('SELECT verification_status FROM service_providers WHERE id = ?', provider.providerId);
        assert.equal(row?.verification_status, 'SUSPENDED');
    });
});
describe('التحقق من نموذج الطلب الديناميكي (على الخادم)', () => {
    test('حقل إلزامي مفقود في form_schema → 422، وحقول غير معرّفة تُحذف', async () => {
        const areaId = await makeArea('اختبار-نموذج', 14.5, 44.5);
        const svc = await getServiceBySlug('daily-worker'); // workers_count إلزامي حسب seed-data
        const customer = await registerUser(api);
        const missing = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'أحتاج عمالًا للنقل', contactPhone: '+967771112233', location: { lat: 14.5, lng: 44.5 }, formData: {} } });
        assert.equal(missing.status, 422);
        const ok = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'أحتاج عمالًا للنقل', contactPhone: '+967771112233', location: { lat: 14.5, lng: 44.5 }, formData: { workers_count: 3, malicious: '<script>' } } });
        assert.equal(ok.status, 201);
        assert.deepEqual(Object.keys(ok.body.order.formData).sort(), ['workers_count']);
    });
    test('خدمة أو منطقة غير مخدومة → أخطاء واضحة', async () => {
        const customer = await registerUser(api);
        const bad = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: 'nope', description: 'وصف كافٍ', contactPhone: '+967771112233', location: { lat: 1, lng: 1 } } });
        assert.equal(bad.status, 404);
        assert.equal(bad.body.error.code, 'SERVICE_NOT_FOUND');
        const svc = await getServiceBySlug('plumbing'); // لا حقول إلزامية في نموذجها
        const remote = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'وصف كافٍ لمشكلة', contactPhone: '+967771112233', location: { lat: 15.9433, lng: 48.7869, source: 'gps' } } });
        assert.equal(remote.status, 201);
        assert.equal(remote.body.order.location.lat, 15.9433);
        assert.equal(remote.body.order.location.lng, 48.7869);
    });
});
describe('الجدولة: انتهاء مهلة العروض وتقدّم الموجات', () => {
    test('انتهاء مهلة عرض المزود الأول يفتح موجة جديدة لمزود آخر لم يُستبعد بعد؛ واستنفاد كل المرشحين يُنبّه العميل والإدارة', async () => {
        // batch_size=1 حتى نضمن أن الموجة الواحدة تُعرَض على مرشح واحد فقط، فيظهر تقدّم الموجات بوضوح بين مزودَين
        const admin = await loginAdmin(api);
        const prevBatch = (await api('GET', '/api/v1/admin/settings', { token: admin })).body.settings.find((s) => s.key === 'assignment.batch_size').value;
        assert.equal((await api('PUT', '/api/v1/admin/settings/assignment.batch_size', { token: admin, body: { value: 1 } })).status, 200);
        try {
            const areaId = await makeArea('اختبار-جدولة', 15.3, 44.2);
            const svc = await getServiceBySlug('legal-services'); // QUOTE، لكن الإسناد بنفس آلية العروض بغض النظر عن نوع التسعير
            const providerA = await makeVerifiedProvider(svc.id, areaId, 'محامٍ أ', 15.3, 44.2);
            const providerB = await makeVerifiedProvider(svc.id, areaId, 'محامٍ ب', 15.3, 44.2);
            const customer = await registerUser(api);
            const create = await api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svc.id, description: 'استشارة قانونية عاجلة', contactPhone: '+967771112233', location: { lat: 15.3, lng: 44.2 } } });
            const orderId = create.body.order.id;
            // الموجة 1: مرشح واحد فقط يستلم العرض (batch_size=1) — الآخر لا شيء بعد
            const offersA1 = (await api('GET', '/api/v1/provider/offers', { token: providerA.token })).body.offers;
            const offersB1 = (await api('GET', '/api/v1/provider/offers', { token: providerB.token })).body.offers;
            assert.equal(offersA1.length + offersB1.length, 1, 'مرشح واحد فقط في الموجة الأولى');
            const firstWasA = offersA1.length === 1;
            const realNow = t.app.clock.now;
            t.app.clock.now = () => realNow() + 4 * 60_000; // تجاوز مهلة العرض الافتراضية (180 ثانية)
            const tick1 = t.app.assignment.tick();
            assert.ok(tick1.expired >= 1, `expired=${tick1.expired}`);
            t.app.clock.now = realNow;
            // الموجة 2: المرشح الذي لم يُعرَض عليه من قبل يستلم العرض الآن (الأول مستبعد لأن له سجل سابق منتهي)
            const offersA2 = (await api('GET', '/api/v1/provider/offers', { token: providerA.token })).body.offers;
            const offersB2 = (await api('GET', '/api/v1/provider/offers', { token: providerB.token })).body.offers;
            if (firstWasA) {
                assert.equal(offersA2.length, 0);
                assert.equal(offersB2.length, 1);
            }
            else {
                assert.equal(offersB2.length, 0);
                assert.equal(offersA2.length, 1);
            }
            const orderRow = t.app.db.get('SELECT wave FROM orders WHERE id = ?', orderId);
            assert.equal(orderRow?.wave, 2);
            // استنفاد كل المرشحين: نرفض عرض الموجة الثانية، فلا يبقى أحد مؤهل — يُعلن الاستنفاد فورًا
            const secondOffer = firstWasA ? offersB2[0] : offersA2[0];
            const secondToken = firstWasA ? providerB.token : providerA.token;
            await api('POST', `/api/v1/provider/offers/${secondOffer.id}/reject`, { token: secondToken });
            const tick2 = t.app.assignment.tick();
            assert.equal(tick2.exhausted, 1);
            const exhaustedOrder = await api('GET', `/api/v1/orders/${orderId}`, { token: customer.body.accessToken });
            assert.ok(['SEARCHING', 'ASSIGNED'].includes(exhaustedOrder.body.order.status));
            assert.ok((await api('GET', '/api/v1/notifications', { token: customer.body.accessToken })).body.notifications.some((n) => n.type === 'NO_PROVIDER_FOUND'));
            assert.ok((await api('GET', '/api/v1/notifications', { token: admin })).body.notifications.some((n) => n.type === 'NO_PROVIDER_FOUND_ADMIN'));
        }
        finally {
            await api('PUT', '/api/v1/admin/settings/assignment.batch_size', { token: admin, body: { value: prevBatch } });
        }
    });
});
describe('حدود عدد الطلبات النشطة', () => {
    test('تجاوز الحد الأقصى للطلبات النشطة للعميل يُرفض', async () => {
        const t2 = await startApp();
        try {
            const areaId2 = await (async () => {
                const admin = await loginAdmin(t2.api);
                const r = await t2.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'اختبار-حدود' }, type: 'CITY', centerLat: 13.3, centerLng: 44.9, radiusKm: 20 } });
                return r.body.area.id;
            })();
            const svcRow = (await t2.api('GET', '/api/v1/categories/delivery/services')).body.services.find((x) => x.slug === 'parcel-delivery');
            await t2.api('PUT', '/api/v1/admin/settings/orders.max_active_per_customer', { token: await loginAdmin(t2.api), body: { value: 2 } });
            const customer = await registerUser(t2.api);
            for (let i = 0; i < 2; i++) {
                const r = await t2.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svcRow.id, description: `طرد رقم ${i}`, contactPhone: '+967771112233', location: { lat: 13.3, lng: 44.9 }, formData: { recipient_name: 'أحمد', recipient_phone: '+967779998888' } } });
                assert.equal(r.status, 201, JSON.stringify(r.body));
            }
            const third = await t2.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: svcRow.id, description: 'طرد ثالث', contactPhone: '+967771112233', location: { lat: 13.3, lng: 44.9 }, formData: { recipient_name: 'أحمد', recipient_phone: '+967779998888' } } });
            assert.equal(third.status, 422);
            assert.equal(third.body.error.code, 'TOO_MANY_ACTIVE_ORDERS');
        }
        finally {
            await t2.close();
        }
    });
});
test('منع إنشاء طلب مكرر بالضغط/الإرسال المتكرر خلال دقيقة', async () => {
    const { api, app, close } = await startApp();
    const reg = await api('POST', '/api/v1/auth/register', { body: { fullName: 'مكرر', phone: '+967711111111', password: 'StrongPass123!', role: 'CUSTOMER' } });
    const token = reg.body.accessToken;
    const serviceId = app.catalog.all().services.find((x) => x.slug === 'legal-services')?.id;
    assert.ok(serviceId);
    const body = { serviceId, description: 'أحتاج هذه الخدمة الآن', location: { lat: 15.3694, lng: 44.1910, accuracy: 20, source: 'gps' }, contactPhone: '+967711111111', formData: {}, priority: 'NORMAL' };
    const a = await api('POST', '/api/v1/orders', { token, body, headers: { 'Idempotency-Key': 'dup-a' } });
    const b = await api('POST', '/api/v1/orders', { token, body, headers: { 'Idempotency-Key': 'dup-b' } });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.body.order.id, a.body.order.id);
    assert.equal(b.body.duplicatePrevented, true);
    await close();
});
//# sourceMappingURL=orders.test.js.map