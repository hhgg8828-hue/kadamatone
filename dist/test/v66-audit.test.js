import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';
const findService = (t, slug) => t.app.catalog.all().services.find((x) => x.slug === slug);
test('V66.2: المناطق تدعم مستوى المحافظة كأب لبقية التسلسل المحلي', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const gov = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'محافظة اختبار' }, type: 'DISTRICT', localityType: 'GOVERNORATE', centerLat: 14, centerLng: 44, radiusKm: 80 } });
        assert.equal(gov.status, 201, gov.text);
        assert.equal(gov.body.area.localityType, 'GOVERNORATE');
        const city = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'مدينة اختبار' }, type: 'CITY', localityType: 'CITY', parentId: gov.body.area.id, centerLat: 14.01, centerLng: 44.01, radiusKm: 15 } });
        assert.equal(city.status, 201, city.text);
        assert.deepEqual(t.app.catalog.areaChain(city.body.area.id).slice(0, 2), [city.body.area.id, gov.body.area.id]);
    }
    finally {
        await t.close();
    }
});
test('V66: المناطق المحلية تدعم المديرية والعزلة والقرية والحارة مع التسلسل الأبوي', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const root = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'مديرية اختبار' }, type: 'DISTRICT', localityType: 'DIRECTORATE', centerLat: 13.9759, centerLng: 44.1709, radiusKm: 20 } });
        assert.equal(root.status, 201, root.text);
        assert.equal(root.body.area.localityType, 'DIRECTORATE');
        const iso = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'عزلة اختبار' }, type: 'DISTRICT', localityType: 'ISOLATION', parentId: root.body.area.id, centerLat: 13.976, centerLng: 44.171, radiusKm: 5 } });
        const village = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'قرية اختبار' }, type: 'DISTRICT', localityType: 'VILLAGE', parentId: iso.body.area.id, centerLat: 13.9761, centerLng: 44.1711, radiusKm: 1 } });
        const neighborhood = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'حارة اختبار' }, type: 'DISTRICT', localityType: 'NEIGHBORHOOD', parentId: village.body.area.id, centerLat: 13.9762, centerLng: 44.1712, radiusKm: .2 } });
        assert.equal(neighborhood.body.area.localityType, 'NEIGHBORHOOD');
        const chain = t.app.catalog.areaChain(neighborhood.body.area.id);
        assert.deepEqual(chain.slice(0, 4), [neighborhood.body.area.id, village.body.area.id, iso.body.area.id, root.body.area.id]);
    }
    finally {
        await t.close();
    }
});
test('V66: تغطية مقدم الخدمة للمديرية تنطبق على قرية تابعة لها', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم المديرية' } });
        const svc = findService(t, 'document-delivery');
        const area = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'مديرية مطابقة' }, type: 'DISTRICT', localityType: 'DIRECTORATE', centerLat: 13.9759, centerLng: 44.1709, radiusKm: 20 } });
        const village = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'قرية مطابقة' }, type: 'DISTRICT', localityType: 'VILLAGE', parentId: area.body.area.id, centerLat: 13.976, centerLng: 44.171, radiusKm: 2 } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?", 13.976, 44.171, pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 3);
        t.app.db.run('INSERT INTO provider_service_areas(provider_id,area_id) VALUES(?,?)', pid, area.body.area.id);
        const loc = t.app.locations.create({ lat: 13.9761, lng: 44.1711, source: 'gps' }, { requireArea: false });
        t.app.db.run('UPDATE locations SET area_id=? WHERE id=?', village.body.area.id, loc.id);
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'توصيل داخل القرية', location: { lat: 13.9761, lng: 44.1711, source: 'gps' }, contactPhone: c.creds.phone } });
        assert.equal(order.status, 201, order.text);
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        assert.ok(offers.body.offers.some((x) => x.orderId === order.body.order.id));
    }
    finally {
        await t.close();
    }
});
test('V66: قائمة مقدمي الخدمة القريبين تعرض المسافة والتغطية حسب الخدمة', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: 'فني قريب' } });
        const svc = findService(t, 'document-delivery');
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?", 13.9759, 44.1709, pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 2);
        const r = await t.api('GET', `/api/v1/providers/nearby?serviceId=${encodeURIComponent(svc.id)}&lat=13.976&lng=44.171`, { token: c.body.accessToken });
        assert.equal(r.status, 200, r.text);
        assert.ok(r.body.providers.some((x) => x.id === pid));
        const row = r.body.providers.find((x) => x.id === pid);
        assert.equal(typeof row.distanceKm, 'number');
        assert.equal(row.isOnline, true);
        assert.equal(row.verified, true);
    }
    finally {
        await t.close();
    }
});
test('V66: صورة بدون AI لا تنشئ نية خاطئة من نص الصورة التلقائي', async () => {
    const t = await startApp();
    try {
        const result = await t.app.intentParser.parse('حلل الصورة المرفقة وحدد الخدمة المناسبة', { catalog: t.app.catalog, locale: 'ar', image: { mime: 'image/jpeg', dataBase64: 'ZmFrZQ==' } });
        assert.notEqual(result.matches[0]?.serviceSlug, 'construction-worker');
    }
    finally {
        await t.close();
    }
});
test('V66: محادثة الطلب تدعم مرفق صورة/ملف ويستطيع الطرف الآخر فتحه', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مزود محادثة' } });
        const svc = findService(t, 'document-delivery');
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?", 13.9759, 44.1709, pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 1);
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'طلب محادثة', location: { lat: 13.9759, lng: 44.1709 }, contactPhone: c.creds.phone } });
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        assert.ok(offers.body.offers.length);
        await t.api('POST', `/api/v1/provider/offers/${offers.body.offers[0].id}/accept`, { token: p.body.accessToken, body: {} });
        const file = await t.api('POST', '/api/v1/files', { token: c.body.accessToken, body: { purpose: 'order_attachment', name: 'proof.pdf', dataBase64: Buffer.from('%PDF-1.4 test').toString('base64') } });
        assert.equal(file.status, 201, file.text);
        const msg = await t.api('POST', `/api/v1/orders/${order.body.order.id}/messages`, { token: c.body.accessToken, body: { body: 'أرسل لك الملف', attachmentFileIds: [file.body.file.id] } });
        assert.equal(msg.status, 201, msg.text);
        assert.equal(msg.body.message.attachments[0].id, file.body.file.id);
        const fromProvider = await t.api('GET', `/api/v1/files/${file.body.file.id}`, { token: p.body.accessToken });
        assert.equal(fromProvider.status, 200, fromProvider.text);
    }
    finally {
        await t.close();
    }
});
test('V66.2: اختيار القرية يدويًا يعمل حتى بدون GPS ويدخل في مطابقة مقدم الخدمة', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مزود قرية بدون GPS' } });
        const svc = findService(t, 'document-delivery');
        const district = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'مديرية يدوية' }, type: 'DISTRICT', localityType: 'DIRECTORATE', centerLat: 13.9, centerLng: 44.1, radiusKm: 20 } });
        const village = await t.api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'قرية يدوية' }, type: 'DISTRICT', localityType: 'VILLAGE', parentId: district.body.area.id, centerLat: 13.91, centerLng: 44.11, radiusKm: 2 } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?", 13.91, 44.11, pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 2);
        t.app.db.run('INSERT INTO provider_service_areas(provider_id,area_id) VALUES(?,?)', pid, district.body.area.id);
        const order = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: 'طلب من قرية بدون GPS', areaId: village.body.area.id, contactPhone: c.creds.phone } });
        assert.equal(order.status, 201, order.text);
        assert.equal(order.body.order.location, null);
        assert.equal(t.app.db.get('SELECT area_id FROM orders WHERE id=?', order.body.order.id).area_id, village.body.area.id);
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        assert.ok(offers.body.offers.some((x) => x.orderId === order.body.order.id));
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v66-audit.test.js.map