import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, registerUser, loginAdmin } from './helpers.js';
function service(t, slug) { return t.app.db.get('SELECT * FROM services WHERE slug=?', slug); }
test('V66.8: الخدمة الأساسية تسوق لي موجودة وتفتح نموذج طلب حقيقي', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const s = service(t, 'shopping-for-me');
        assert.ok(s?.id);
        const r = await t.api('GET', `/api/v1/services/${s.id}`);
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.service.slug, 'shopping-for-me');
        const o = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, headers: { 'Idempotency-Key': 'shopping-v668' }, body: { serviceId: s.id, description: 'بيبسي وماء وبسكويت', contactPhone: c.creds.phone, formData: { shopping_type: 'GROCERY', items: 'بيبسي وماء وبسكويت' } } });
        assert.equal(o.status, 201, o.text);
        assert.equal(t.app.db.get('SELECT s.slug FROM orders o JOIN services s ON s.id=o.service_id WHERE o.id=?', o.body.order.id)?.slug, 'shopping-for-me');
    }
    finally {
        await t.close();
    }
});
test('V66.8: محرك النية الهجين يفهم صيغ النقل والشراء والصيدلية والزراعة', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const cases = [
            ['أريد شخص يوصلني', 'passenger-transport', ['trip:passenger']],
            ['أريد واحد يشتري لي بيبسي ويوصله للبيت', 'purchase-and-delivery', ['purchase:store', 'delivery:item']],
            ['أريد واحد يجيب لي دواء من الصيدلية', 'pharmacy-purchase', ['purchase:pharmacy', 'delivery:item']],
            ['أريد واحد يأخذ ملابس من بيت أخوي ويوصلها لي', 'parcel-delivery', ['pickup:item', 'delivery:item']],
            ['أريد واحد يتسوق لي', 'shopping-for-me', ['purchase:store', 'delivery:item']],
        ];
        for (const [text, slug, caps] of cases) {
            const r = await t.api('POST', '/api/v1/assist/request', { token: c.body.accessToken, body: { text } });
            assert.equal(r.status, 200, r.text);
            assert.equal(r.body.recommended?.serviceSlug, slug, text);
            assert.deepEqual(r.body.extracted.structured.requiredCapabilities, caps, text);
        }
        const audit = t.app.db.get('SELECT analysis_json FROM intent_audit WHERE customer_id=? ORDER BY created_at DESC LIMIT 1', c.body.user.id);
        assert.ok(audit?.analysis_json);
    }
    finally {
        await t.close();
    }
});
test('V66.8: الخدمات الزراعية الثلاثة تفهم لغويًا عند تفعيل موسمها', async () => {
    const t = await startApp();
    try {
        const admin = await loginAdmin(t.api);
        const now = Date.now();
        for (const slug of ['seasonal-plowing', 'seasonal-harvest', 'seasonal-crop-transport']) {
            const s = service(t, slug);
            assert.ok(s?.id);
            t.app.db.run('UPDATE services SET seasonal_enabled=1,season_start_at=?,season_end_at=? WHERE id=?', new Date(now - 3600000).toISOString(), new Date(now + 86400000).toISOString(), s.id);
        }
        const c = await registerUser(t.api);
        for (const [text, slug] of [['أريد واحد يحرث أرضي', 'seasonal-plowing'], ['أريد أحد يحصد المحصول', 'seasonal-harvest'], ['أريد نقل المحصول', 'seasonal-crop-transport']]) {
            const r = await t.api('POST', '/api/v1/assist/request', { token: c.body.accessToken, body: { text } });
            assert.equal(r.body.recommended?.serviceSlug, slug, text);
        }
    }
    finally {
        await t.close();
    }
});
test('V66.8: لوحة الإدارة تستخدم حاوية RTL صحيحة وتدعم تعديل الحملات والخدمات المؤقتة', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    assert.ok(app.includes("admin-page admin-shell"));
    assert.ok(app.includes('data-temp-edit'));
    assert.ok(app.includes('data-camp-edit'));
    assert.ok(css.includes('.admin-page,.admin-page .modal,.admin-page .modal>.card'));
});
test('V66.8: مشاوير بالدباب لا يحمل Leaflet عند فتح النموذج ويطلبه فقط عند فتح الخريطة', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const section = app.slice(app.indexOf('async function openMotorcycleTripForm'), app.indexOf('async function openOrderFormBySlug'));
    assert.ok(section.includes("tripOriginMapBtn"));
    assert.ok(section.includes("ensureTripMap('origin')"));
    assert.ok(section.includes("const L:any=null"));
    assert.equal(section.indexOf('const L=await ensureLeaflet().catch(()=>null);'), -1);
});
//# sourceMappingURL=v66_8_intent_shopping.test.js.map