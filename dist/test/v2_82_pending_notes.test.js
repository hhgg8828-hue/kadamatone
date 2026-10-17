import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateServiceFilter, parseTrackingProductLines } from '../public/service-filter-logic.js';
import { startApp, registerUser, loginAdmin } from './helpers.js';
const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const services = [
    { id: 'old', createdAt: '2026-09-01T00:00:00.000Z', categorySlug: 'home', distanceKm: 9, originalIndex: 0 },
    { id: 'newest', createdAt: '2026-10-16T10:00:00.000Z', categorySlug: 'home', distanceKm: 4, originalIndex: 1 },
    { id: 'middle', createdAt: '2026-10-14T10:00:00.000Z', categorySlug: 'farm', distanceKm: 1, originalIndex: 2 },
    { id: 'newer', createdAt: '2026-10-15T10:00:00.000Z', categorySlug: 'farm', distanceKm: 2, originalIndex: 3 },
    { id: 'missing-date', categorySlug: 'home', distanceKm: 3, originalIndex: 4 },
    { id: 'no-distance', createdAt: '2026-10-15T09:00:00.000Z', originalIndex: 5 },
];
test('V2.82: customer service filters are exact and ordered from real fields', () => {
    assert.deepEqual(evaluateServiceFilter(services, 'all', [], { now: NOW }).matches.map(x => x.id), services.map(x => x.id));
    for (const ids of [[], ['old'], ['old', 'newest', 'middle'], ['old', 'newest', 'middle', 'newer', 'missing-date']]) {
        const result = evaluateServiceFilter(services, 'favorite', ids, { now: NOW });
        assert.deepEqual(new Set(result.matches.map(x => x.id)), new Set(ids));
        assert.equal(result.matches.length, ids.length);
    }
    assert.deepEqual(evaluateServiceFilter(services, 'favorite', ['newest', 'middle', 'newer'], { now: NOW }).matches.map(x => x.id), ['newest', 'middle', 'newer']);
    assert.deepEqual(evaluateServiceFilter(services, 'new', [], { now: NOW }).matches.map(x => x.id), ['newest', 'newer', 'no-distance', 'middle', 'old']);
    assert.deepEqual(evaluateServiceFilter(services, 'nearby', [], { now: NOW, locationAvailable: true }).matches.map(x => x.id), ['middle', 'newer', 'missing-date', 'newest', 'old']);
    assert.deepEqual(evaluateServiceFilter(services, 'nearby', [], { now: NOW, locationAvailable: false }).matches, []);
    assert.deepEqual(evaluateServiceFilter(services, 'favorite', ['newest', 'newer', 'old'], { now: NOW, selectedCategorySlug: 'farm' }).matches.map(x => x.id), ['newer']);
    assert.deepEqual(parseTrackingProductLines('طلب توصيل مياه', 'توصيل مياه', { quantity: 2 }, null).map(x => ({ name: x.name, quantity: x.quantity })), [{ name: 'توصيل مياه', quantity: 2 }]);
    assert.deepEqual(parseTrackingProductLines('طلب توصيل مياه\nالخدمات الإضافية ضمن الطلب:\n1. تركيب ألواح شمسية — الكمية: 1 — سعر الوحدة 700', 'توصيل مياه', { quantity: 2, primaryUnitPriceSnapshot: 400, additionalServices: [{ name: 'تركيب ألواح شمسية', quantity: 1, unitPrice: 700 }] }, 1100).map(x => ({ name: x.name, quantity: x.quantity, unitPrice: x.unitPrice, lineTotal: x.lineTotal })), [{ name: 'توصيل مياه', quantity: 2, unitPrice: 400, lineTotal: 800 }, { name: 'تركيب ألواح شمسية', quantity: 1, unitPrice: 700, lineTotal: 700 }]);
    assert.deepEqual(parseTrackingProductLines('طلب عامل بناء\nالخدمات الإضافية ضمن الطلب:\n1. غسل سيارة متنقل — الكمية: 1 — سعر الوحدة 1500', 'عامل بناء', { workers: 3, primaryQuantitySnapshot: 3, primaryUnitPriceSnapshot: 10000, additionalServices: [{ name: 'غسل سيارة متنقل', quantity: 1, unitPrice: 1500 }] }, 31500).map(x => ({ name: x.name, quantity: x.quantity, unitPrice: x.unitPrice, lineTotal: x.lineTotal })), [{ name: 'عامل بناء', quantity: 3, unitPrice: 10000, lineTotal: 30000 }, { name: 'غسل سيارة متنقل', quantity: 1, unitPrice: 1500, lineTotal: 1500 }]);
});
test('V2.82: admin can schedule a future callback and later confirm it', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const customer = await registerUser(t.api);
        const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
        const service = cats.flatMap((x) => x.services || []).find((x) => x.slug === 'air-conditioning') || cats.flatMap((x) => x.services || [])[0];
        assert.ok(service, 'seed catalog must contain at least one service');
        const provider = await registerUser(t.api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: 'مقدم متابعة مجدولة' } });
        assert.equal(provider.status, 201, provider.text);
        const providerLogin = await t.api('POST', '/api/v1/auth/login', { body: { identifier: provider.creds.phone, password: provider.creds.password } });
        assert.equal(providerLogin.status, 200, providerLogin.text);
        const providerToken = providerLogin.body.accessToken;
        assert.equal((await t.api('PUT', '/api/v1/provider/services', { token: providerToken, body: { services: [{ serviceId: service.id, experienceYears: 1 }] } })).status, 200);
        t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1 WHERE user_id=(SELECT id FROM users WHERE phone=?)", provider.creds.phone);
        const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: service.id, description: 'طلب يحتاج إلى تأكيد بالاتصال', contactPhone: '+967771234567' } });
        assert.equal(created.status, 201, created.text);
        const orderId = created.body.order.id;
        assert.ok(t.app.db.get("SELECT id FROM order_assignments WHERE order_id=? AND status='OFFERED'", orderId), 'a matching provider should receive the order before callback scheduling');
        const past = await t.api('PATCH', `/api/v1/admin/order-confirmations/${orderId}`, { token: admin, body: { status: 'SCHEDULED', followUpAt: new Date(Date.now() - 60000).toISOString(), note: 'لم يرد' } });
        assert.equal(past.status, 422);
        const followUpAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const scheduled = await t.api('PATCH', `/api/v1/admin/order-confirmations/${orderId}`, { token: admin, body: { status: 'SCHEDULED', followUpAt, note: 'إعادة الاتصال مساءً' } });
        assert.equal(scheduled.status, 200, scheduled.text);
        assert.equal(scheduled.body.status, 'SCHEDULED');
        assert.equal(t.app.db.get("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND status='OFFERED'", orderId).n, 0, 'scheduling callback must withdraw open provider offers');
        assert.equal(t.app.db.get('SELECT status FROM orders WHERE id=?', orderId).status, 'SEARCHING');
        assert.deepEqual(t.app.matcher.findCandidates(t.app.db.get('SELECT * FROM orders WHERE id=?', orderId), { excludeProviderIds: [], limit: 5 }), [], 'scheduled order must not be offered again before customer confirmation');
        const queue = await t.api('GET', '/api/v1/admin/order-confirmations?status=SCHEDULED', { token: admin });
        assert.equal(queue.status, 200, queue.text);
        assert.equal(queue.body.items[0].orderId, orderId);
        assert.ok(queue.body.items[0].followUpAt);
        assert.equal(queue.body.counts.scheduled, 1);
        const confirmed = await t.api('PATCH', `/api/v1/admin/order-confirmations/${orderId}`, { token: admin, body: { status: 'CONFIRMED', note: 'أكد العميل الطلب' } });
        assert.equal(confirmed.status, 200, confirmed.text);
        const stored = t.app.db.get('SELECT status,follow_up_at,follow_up_note FROM order_contact_confirmations WHERE order_id=?', orderId);
        assert.equal(stored.status, 'CONFIRMED');
        assert.equal(stored.follow_up_at, null);
        assert.equal(stored.follow_up_note, null);
        assert.ok(t.app.db.get("SELECT id FROM order_assignments WHERE order_id=? AND status='OFFERED'", orderId), 'confirmation should resume provider assignment');
    }
    finally {
        await t.close();
    }
});
test('V2.82: additional services are server-validated and become invoice/execution tasks', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const customer = await registerUser(t.api);
        const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
        const services = cats.flatMap((x) => x.services || []);
        const primary = services.find((x) => x.slug === 'water-tank-delivery') || services[0];
        const extra = services.find((x) => x.id !== primary.id && x.isActive !== false);
        assert.ok(primary && extra);
        t.app.db.run('UPDATE services SET form_schema=? WHERE id=?', JSON.stringify([{ key: 'quantity', type: 'number', label: { ar: 'الكمية', en: 'Quantity' }, required: false, min: 1, max: 999 }]), extra.id);
        t.app.catalog.invalidate();
        const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: primary.id, description: 'طلب توصيل مياه مع خدمة إضافية', contactPhone: '+967771234567', additionalServices: [{ serviceId: extra.id, quantity: 2 }] } });
        assert.equal(created.status, 201, created.text);
        const saved = t.app.db.get('SELECT description,form_data FROM orders WHERE id=?', created.body.order.id);
        assert.match(saved.description, /الخدمات الإضافية ضمن الطلب/);
        const data = JSON.parse(saved.form_data);
        assert.equal(data.additionalServices[0].serviceId, extra.id);
        assert.equal(data.additionalServices[0].quantity, 2);
        if (data.additionalServices[0].pricingType === 'QUOTE')
            assert.equal(created.body.order.pricingType, 'QUOTE');
        const tasks = t.app.db.all('SELECT title,details FROM order_tasks WHERE order_id=?', created.body.order.id);
        assert.ok(tasks.some((x) => x.title.includes(extra.name)));
        const duplicate = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: primary.id, description: 'طلب توصيل مياه مع خدمة إضافية', contactPhone: '+967771234567', additionalServices: [{ serviceId: extra.id }, { serviceId: extra.id }] } });
        assert.equal(duplicate.status, 422);
    }
    finally {
        await t.close();
    }
});
test('V2.82: required theme, icon, arrow, and tracking quantity fixes are wired into the UI', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    assert.match(app, /evaluateServiceFilter\(filterServices,key/);
    assert.match(app, /parseTrackingProductLines\(String\(o\.description\|\|''\)/);
    assert.match(app, /additionalServices:checkoutAdditionalServices\.map/);
    assert.match(app, /data-confirm-order="SCHEDULED"/);
    assert.match(css, /:root\[data-theme="dark"\] \.a11y-options label/);
    assert.match(css, /checkout-recommendation-image \.service-icon-svg\{stroke:#b9f1d3/);
    assert.match(css, /customer-notification-location-wrap \.customer-area-arrow\{right:-9px;bottom:-6px/);
    assert.match(css, /provider-shell \.capability-options label/);
    assert.match(css, /:root\[data-theme=\"dark\"\] \.provider-shell \.capability-options label/);
    assert.match(css, /#tripEstimateNote\{display:none!important/);
});
test('V2.87: primary quantity snapshot remains independent from added service quantity and price', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
        const services = cats.flatMap((x) => x.services || []);
        const primary = services.find((x) => x.isActive !== false) || services[0];
        const extra = services.find((x) => x.id !== primary.id && x.isActive !== false);
        assert.ok(primary && extra);
        t.app.db.run('UPDATE services SET pricing_type=?,base_price=?,uses_category_default=0,form_schema=? WHERE id=?', 'FIXED', 10000, JSON.stringify([{ key: 'workers', type: 'number', label: { ar: 'عدد العمال', en: 'Workers' }, required: true, min: 1, max: 20 }]), primary.id);
        t.app.db.run('UPDATE services SET pricing_type=?,base_price=?,uses_category_default=0,form_schema=? WHERE id=?', 'FIXED', 1500, JSON.stringify([{ key: 'washType', type: 'select', label: { ar: 'نوع الغسيل', en: 'Wash type' }, required: false, options: [{ value: 'inside-outside', label: { ar: 'داخلي وخارجي', en: 'Inside and outside' } }] }]), extra.id);
        t.app.catalog.invalidate();
        const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: { serviceId: primary.id, description: 'عامل بناء', formData: { workers: 3 }, contactPhone: customer.creds.phone, additionalServices: [{ serviceId: extra.id, quantity: 1, formData: { washType: 'inside-outside' } }] } });
        assert.equal(created.status, 201, created.text);
        const saved = t.app.db.get('SELECT form_data,price_snapshot FROM orders WHERE id=?', created.body.order.id);
        const data = JSON.parse(saved.form_data);
        assert.equal(data.primaryQuantitySnapshot, 3);
        assert.equal(data.primaryUnitPriceSnapshot, 10000);
        assert.equal(saved.price_snapshot, 31500);
        assert.equal(data.additionalServices[0].quantity, 1);
        assert.equal(data.additionalServices[0].formData.washType, 'inside-outside');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_82_pending_notes.test.js.map