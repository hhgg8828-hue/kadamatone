import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';
test('V66.13: حالات مقدم الخدمة مستقلة وHeartbeat يحدّث المصدر الحقيقي', async () => {
    const t = await startApp();
    try {
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مقدم حي' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=0,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        const prof = await t.api('GET', '/api/v1/provider/profile', { token: p.body.accessToken });
        assert.equal(prof.status, 200);
        assert.equal(prof.body.provider.isOnline, true);
        assert.equal(prof.body.provider.acceptingOrders, false);
        const on = await t.api('POST', '/api/v1/provider/accepting-orders', { token: p.body.accessToken, body: { accepting: true } });
        assert.equal(on.status, 200, on.text);
        assert.equal(on.body.acceptingOrders, true);
        const hb = await t.api('POST', '/api/v1/provider/presence-heartbeat', { token: p.body.accessToken, body: {} });
        assert.equal(hb.status, 200);
        assert.ok(hb.body.lastHeartbeatAt);
    }
    finally {
        await t.close();
    }
});
test('V66.13: المطابقة لا ترسل طلبًا لمن أوقف استقبال الطلبات', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'لا يستقبل' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        const svc = t.app.db.get("SELECT id FROM services WHERE slug='cleaning'");
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=0,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 2);
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v6611-no-accept' }, body: { serviceId: svc.id, description: 'أحتاج تنظيف المنزل بالكامل', location: { lat: 15.36, lng: 44.19 }, contactPhone: c.creds.phone } });
        assert.equal(o.status, 201, o.text);
        const offers = await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken });
        assert.equal(offers.body.offers.some((x) => x.orderId === o.body.order.id), false);
    }
    finally {
        await t.close();
    }
});
test('V66.13: المشوار يسمح بالإرسال بدون وجهة ثم إضافة الوجهة لاحقًا', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const o = await t.api('POST', '/api/v1/trips', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v6611-trip-no-dest' }, body: { origin: { lat: 15.36, lng: 44.19 }, purpose: 'PASSENGER', description: 'أريد مشوارًا شخصيًا', contactPhone: c.creds.phone } });
        assert.equal(o.status, 201, o.text);
        assert.equal(o.body.trip.destinationPending, true);
        assert.equal(o.body.trip.destination, null);
        const d = await t.api('POST', `/api/v1/trips/${o.body.order.id}/destination`, { token: c.body.accessToken, body: { destination: { lat: 15.37, lng: 44.20 } } });
        assert.equal(d.status, 200, d.text);
        assert.equal(d.body.trip.destinationPending, false);
        assert.ok(d.body.distanceKm > 0);
        assert.ok(d.body.fare > 0);
    }
    finally {
        await t.close();
    }
});
test('V66.13: لوحة المراقبة الحية تعيد جميع مقدمي الخدمة مع heartbeat/location/order', async () => {
    const t = await startApp();
    try {
        const admin = await t.api('POST', '/api/v1/auth/login', { body: { identifier: 'admin@test.local', password: 'AdminPass123' } });
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مراقبة' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,last_seen_at=?,last_heartbeat_at=?,last_location_at=? WHERE id=?", new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), pid);
        const live = await t.api('GET', '/api/v1/admin/operations/live', { token: admin.body.accessToken });
        assert.equal(live.status, 200, live.text);
        const row = live.body.providers.find((x) => x.id === pid);
        assert.ok(row);
        assert.equal(row.isOnline, true);
        assert.equal(row.acceptingOrders, true);
        assert.ok('lastHeartbeatAt' in row);
        assert.ok('lastLocationAt' in row);
        assert.ok('currentOrder' in row);
    }
    finally {
        await t.close();
    }
});
test('V66.13: إكمال مشوار يحسب المسافة الفعلية من سجل المواقع ويحدّث الأجرة النهائية', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'سائق مشوار' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        const svc = t.app.catalog.all().services.find((x) => x.slug === 'motorcycle-trips');
        assert.ok(svc);
        const serviceId = String(svc.id);
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, serviceId, 2);
        const now = new Date().toISOString();
        t.app.db.run("INSERT INTO provider_vehicles(id,provider_id,vehicle_type,status,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", 'veh-v6611', pid, 'MOTORCYCLE', 'VERIFIED', 1, now, now);
        const o = await t.api('POST', '/api/v1/trips', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v6611-final-distance' }, body: { origin: { lat: 15.3600, lng: 44.1900 }, destination: { lat: 15.3700, lng: 44.2000 }, purpose: 'PASSENGER', description: 'مشوار لاختبار المسافة الفعلية', contactPhone: c.creds.phone } });
        assert.equal(o.status, 201, o.text);
        const id = o.body.order.id;
        const offer = (await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken })).body.offers[0];
        await t.api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: p.body.accessToken, body: {} });
        t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)', id, pid, 15.3600, 44.1900, new Date(Date.now() - 2000).toISOString());
        t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)', id, pid, 15.3650, 44.1950, new Date(Date.now() - 1000).toISOString());
        t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)', id, pid, 15.3700, 44.2000, new Date().toISOString());
        await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'ON_THE_WAY' } });
        await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'IN_PROGRESS' } });
        const proof = await t.api('POST', `/api/v1/orders/${id}/delivery-proof/issue`, { token: c.body.accessToken, body: {} });
        assert.equal(proof.status, 200, proof.text);
        const verified = await t.api('POST', `/api/v1/provider/orders/${id}/delivery-proof/verify`, { token: p.body.accessToken, body: { pin: proof.body.pin } });
        assert.equal(verified.status, 200, verified.text);
        const done = await t.api('POST', `/api/v1/provider/orders/${id}/status`, { token: p.body.accessToken, body: { to: 'COMPLETED' } });
        assert.equal(done.status, 200, done.text);
        const trip = t.app.db.get('SELECT distance_km distanceKm,fare FROM trip_orders WHERE order_id=?', id);
        assert.ok(trip.distanceKm > 0);
        assert.equal(done.body.order.agreedPrice, trip.fare);
    }
    finally {
        await t.close();
    }
});
test('V66.12+: المستفيد يستخدم Idempotency-Key ولا ينشئ سجلًا مكررًا عند إعادة الإرسال', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const h = { 'Idempotency-Key': 'beneficiary-retry-1' };
        const body = { label: 'أمي', fullName: 'محمد أحمد', phone: '+967771234567' };
        const a = await t.api('POST', '/api/v1/me/beneficiaries', { token: c.body.accessToken, headers: h, body });
        const b = await t.api('POST', '/api/v1/me/beneficiaries', { token: c.body.accessToken, headers: h, body });
        assert.equal(a.status, 201, a.text);
        assert.equal(b.status, 200, b.text);
        assert.equal(b.body.idempotent, true);
        const row = t.app.db.get('SELECT COUNT(*) n FROM customer_beneficiaries WHERE customer_id=?', c.body.user.id);
        assert.equal(row.n, 1);
    }
    finally {
        await t.close();
    }
});
test('V66.12+: رد الشكوى يرسل حدث Realtime مرتبطًا بالشكوى والطلب', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مزود شكوى' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        const svc = t.app.catalog.all().services.find((x) => x.slug === 'cleaning');
        assert.ok(svc);
        const serviceId = String(svc.id);
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, serviceId, 2);
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'complaint-sse-order' }, body: { serviceId, description: 'خدمة تنظيف لاختبار الشكوى', location: { lat: 15.36, lng: 44.19 }, contactPhone: c.creds.phone } });
        assert.equal(o.status, 201, o.text);
        const offer = (await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken })).body.offers[0];
        await t.api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: p.body.accessToken, body: {} });
        const complaint = await t.api('POST', `/api/v1/orders/${o.body.order.id}/complaints`, { token: c.body.accessToken, body: { category: 'QUALITY', description: 'الخدمة تحتاج مراجعة' } });
        assert.equal(complaint.status, 201, complaint.text);
        const events = [];
        const original = t.app.sse.send.bind(t.app.sse);
        t.app.sse.send = (uid, event, data) => { events.push({ uid, event, data }); return original(uid, event, data); };
        const reply = await t.api('POST', `/api/v1/complaints/${complaint.body.complaint.id}/reply`, { token: p.body.accessToken, body: { body: 'تم استلام الشكوى وسأتابعها' } });
        assert.equal(reply.status, 200, reply.text);
        assert.ok(events.some(x => x.event === 'complaint_message' && x.data.complaintId === complaint.body.complaint.id && x.data.orderId === o.body.order.id));
    }
    finally {
        await t.close();
    }
});
test('V66.12+: تشخيص الأداء يعرض DB وRealtime وطلبات API', async () => {
    const t = await startApp();
    try {
        const admin = await t.api('POST', '/api/v1/auth/login', { body: { identifier: 'admin@test.local', password: 'AdminPass123' } });
        assert.equal(admin.status, 200, admin.text);
        const r = await t.api('GET', '/api/v1/admin/performance-diagnostics', { token: admin.body.accessToken });
        assert.equal(r.status, 200, r.text);
        assert.ok(typeof r.body.server.database.queries === 'number');
        assert.ok(typeof r.body.server.sse.connections === 'number');
        assert.ok(Array.isArray(r.body.api));
    }
    finally {
        await t.close();
    }
});
test('V66.13: مقدم الخدمة يستقبل الطلب الجديد رغم وجود طلب قيد التنفيذ ما دام يستقبل الطلبات', async () => {
    const t = await startApp();
    try {
        const c1 = await registerUser(t.api);
        const c2 = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مزود متعدد الطلبات' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        const svc = t.app.db.get("SELECT id FROM services WHERE slug='cleaning'");
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 5);
        const first = await t.api('POST', '/api/v1/orders', { token: c1.body.accessToken, headers: { 'Idempotency-Key': 'v6613-first' }, body: { serviceId: svc.id, description: 'طلب أول قيد التنفيذ', location: { lat: 15.36, lng: 44.19 }, contactPhone: c1.creds.phone } });
        assert.equal(first.status, 201, first.text);
        const offer1 = (await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken })).body.offers.find((x) => x.orderId === first.body.order.id);
        assert.ok(offer1);
        await t.api('POST', `/api/v1/provider/offers/${offer1.id}/accept`, { token: p.body.accessToken, body: {} });
        const second = await t.api('POST', '/api/v1/orders', { token: c2.body.accessToken, headers: { 'Idempotency-Key': 'v6613-second' }, body: { serviceId: svc.id, description: 'طلب ثان قريب من الطلب الأول', location: { lat: 15.361, lng: 44.191 }, contactPhone: c2.creds.phone } });
        assert.equal(second.status, 201, second.text);
        const offers = (await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken })).body.offers;
        assert.ok(offers.some((x) => x.orderId === second.body.order.id));
    }
    finally {
        await t.close();
    }
});
test('V66.13: رسالة العميل تنشئ إشعارًا قابلًا لفتح نفس الطلب، والمزود يستطيع فتح المحادثة', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const p = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'DRIVER', displayName: 'مزود محادثة' } });
        const pid = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id).id;
        const svc = t.app.db.get("SELECT id FROM services WHERE slug='cleaning'");
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?", pid);
        t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)', pid, svc.id, 2);
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v6613-chat-order' }, body: { serviceId: svc.id, description: 'طلب لاختبار المحادثة الحية', location: { lat: 15.36, lng: 44.19 }, contactPhone: c.creds.phone } });
        assert.equal(o.status, 201, o.text);
        const offer = (await t.api('GET', '/api/v1/provider/offers', { token: p.body.accessToken })).body.offers[0];
        await t.api('POST', `/api/v1/provider/offers/${offer.id}/accept`, { token: p.body.accessToken, body: {} });
        const sent = await t.api('POST', `/api/v1/orders/${o.body.order.id}/messages`, { token: c.body.accessToken, headers: { 'Idempotency-Key': 'v6613-message-1' }, body: { body: 'أين وصلت؟' } });
        assert.equal(sent.status, 201, sent.text);
        const ns = (await t.api('GET', '/api/v1/notifications?limit=20', { token: p.body.accessToken })).body.notifications;
        const n = ns.find((x) => x.type === 'CHAT_MESSAGE' && x.data?.orderId === o.body.order.id);
        assert.ok(n);
        assert.equal(n.data.open, 'chat');
        const msgs = await t.api('GET', `/api/v1/orders/${o.body.order.id}/messages?limit=20`, { token: p.body.accessToken });
        assert.equal(msgs.status, 200, msgs.text);
        assert.equal(msgs.body.messages.at(-1).body, 'أين وصلت؟');
        const reply = await t.api('POST', `/api/v1/orders/${o.body.order.id}/messages`, { token: p.body.accessToken, headers: { 'Idempotency-Key': 'v6613-message-2' }, body: { body: 'أنا قريب، بجوار السوق وسأصل خلال 5 دقائق.' } });
        assert.equal(reply.status, 201, reply.text);
        const back = await t.api('GET', `/api/v1/orders/${o.body.order.id}/messages?limit=20`, { token: c.body.accessToken });
        assert.equal(back.body.messages.at(-1).body, 'أنا قريب، بجوار السوق وسأصل خلال 5 دقائق.');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v66_11_live_operations.test.js.map