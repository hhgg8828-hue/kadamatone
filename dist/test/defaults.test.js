import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, registerUser, loginAdmin, uniquePhone } from './helpers.js';
import { seedDemo } from '../src/db/seed.js';
import { SETTINGS } from '../src/modules/settings.js';
import { DEMO_AREAS } from '../src/db/seed-data.js';
let t, api;
before(async () => { t = await startApp(); api = t.api; });
after(async () => { await t.close(); });
describe('الإعدادات الافتراضية: اليمن / YER / Asia/Aden / العربية', () => {
    test('سجل الإعدادات لا يحتوي USD أو UTC كقيم تشغيلية', () => {
        assert.equal(SETTINGS['platform.currency'].def, 'YER');
        assert.equal(SETTINGS['platform.timezone'].def, 'Asia/Aden');
        assert.equal(SETTINGS['platform.country'].def, 'YE');
        assert.equal(SETTINGS['platform.default_locale'].def, 'ar');
    });
    test('Seed يكتب الإعدادات في جدول system_settings (قابلة للتعديل من DB)', () => {
        const rows = Object.fromEntries(t.app.db.all('SELECT key, value FROM system_settings').map((r) => [r.key, JSON.parse(r.value)]));
        assert.equal(rows['platform.currency'], 'YER');
        assert.equal(rows['platform.timezone'], 'Asia/Aden');
        assert.equal(rows['platform.country'], 'YE');
        assert.equal(rows['platform.default_locale'], 'ar');
    });
    test('GET /config: يمن، ريال، عدن، عربي RTL، الإنجليزية جاهزة', async () => {
        const r = await api('GET', '/api/v1/config');
        assert.deepEqual({ country: r.body.country, currency: r.body.currency, timezone: r.body.timezone, defaultLocale: r.body.defaultLocale, direction: r.body.direction }, { country: 'YE', currency: 'YER', timezone: 'Asia/Aden', defaultLocale: 'ar', direction: 'rtl' });
        assert.deepEqual(r.body.supportedLocales, ['ar', 'en']);
    });
    test('أسعار الخدمات تُعرض بعملة YER', async () => {
        const list = await api('GET', '/api/v1/categories/home-services/services');
        assert.ok(list.body.services.every((s) => s.currency === 'YER'));
        const ac = list.body.services.find((s) => s.slug === 'air-conditioning');
        assert.ok(ac.basePrice >= 1000, 'الأسعار المبدئية بالريال اليمني وليست بأرقام الدولار');
    });
    test('لا قاهرة ولا مدن/عملات مبرمجة في الشيفرة', () => {
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
        const files = walk(path.join(t.app.config.root, 'src')).filter((f) => f.endsWith('.ts') || f.endsWith('.sql'));
        for (const f of files) {
            const txt = fs.readFileSync(f, 'utf8');
            assert.ok(!/القاهرة|Cairo|'USD'|'UTC'/.test(txt), `${path.relative(t.app.config.root, f)} يحتوي إعدادًا غير مطلوب`);
        }
    });
});
describe('تعديل الإعدادات من الإدارة', () => {
    test('SUPER_ADMIN يعدّل الإعداد ويُسجَّل في Audit ويتغير /config فورًا', async () => {
        const admin = await loginAdmin(api);
        const r = await api('PUT', '/api/v1/admin/settings/platform.commission_percent', { token: admin, body: { value: 12.5 } });
        assert.equal(r.status, 200);
        assert.equal(t.app.settings.get('platform.commission_percent'), 12.5);
        const logs = await api('GET', '/api/v1/admin/audit-logs?entityType=setting&entityId=platform.commission_percent', { token: admin });
        assert.deepEqual(logs.body.logs[0].after, { value: 12.5 });
        assert.deepEqual(logs.body.logs[0].before, { value: 10 });
    });
    test('قيمة غير صالحة → 422، وإعداد مجهول → 404', async () => {
        const admin = await loginAdmin(api);
        assert.equal((await api('PUT', '/api/v1/admin/settings/platform.commission_percent', { token: admin, body: { value: 500 } })).status, 422);
        assert.equal((await api('PUT', '/api/v1/admin/settings/platform.currency', { token: admin, body: { value: 'yer' } })).status, 422);
        assert.equal((await api('PUT', '/api/v1/admin/settings/nope', { token: admin, body: { value: 1 } })).status, 404);
    });
    test('غير SUPER_ADMIN لا يعدّل الإعدادات (ADMIN يقرأ فقط، العميل ممنوع)', async () => {
        const admin = await loginAdmin(api);
        await api('POST', '/api/v1/admin/admins', { token: admin, body: { fullName: 'مدير عادي', phone: uniquePhone(), email: 'adm2@test.local', password: 'AdminTwo1234', adminLevel: 'ADMIN' } });
        const tok = (await api('POST', '/api/v1/auth/login', { body: { identifier: 'adm2@test.local', password: 'AdminTwo1234' } })).body.accessToken;
        assert.equal((await api('GET', '/api/v1/admin/settings', { token: tok })).status, 200);
        assert.equal((await api('PUT', '/api/v1/admin/settings/platform.currency', { token: tok, body: { value: 'SAR' } })).status, 403);
        const c = await registerUser(api);
        assert.equal((await api('GET', '/api/v1/admin/settings', { token: c.body.accessToken })).status, 403);
    });
});
describe('المناطق قابلة للتعديل من DB (بيانات يمنية للاختبار)', () => {
    test('seed:demo ينشئ مناطق يمنية فقط بشجرة دولة ← مدينة ← مديرية، ويرفض الإنتاج', async () => {
        const t2 = await startApp();
        try {
            await seedDemo(t2.app.db, t2.app.config);
            t2.app.catalog.invalidate();
            const areas = (await t2.api('GET', '/api/v1/areas')).body.areas;
            assert.equal(areas.length, DEMO_AREAS.length);
            assert.ok(areas.find((a) => a.name === 'عدن') && areas.find((a) => a.name === 'صنعاء'));
            assert.ok(!areas.find((a) => /قاهر/.test(a.name)));
            // تحديد المنطقة من الإحداثيات: كريتر (مديرية) أدق من عدن (مدينة)
            const crater = t2.app.catalog.resolveArea(12.78, 45.036);
            assert.equal(JSON.parse(crater.name_i18n).ar, 'كريتر');
            assert.deepEqual(t2.app.catalog.areaChain(crater.id).length, 3, 'كريتر ← عدن ← اليمن');
            assert.equal(JSON.parse(t2.app.catalog.resolveArea(15.37, 44.19).name_i18n).ar, 'صنعاء');
            assert.equal(t2.app.catalog.resolveArea(51.5, -0.12), null, 'خارج اليمن → لا منطقة');
            await assert.rejects(() => seedDemo(t2.app.db, { ...t2.app.config, isProd: true }), /not allowed in production/);
        }
        finally {
            await t2.close();
        }
    });
    test('المدير يضيف منطقة جديدة ويعطّلها بدون تعديل كود', async () => {
        const admin = await loginAdmin(api);
        const c = await api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'سيئون', en: 'Seiyun' }, type: 'CITY', centerLat: 15.9433, centerLng: 48.7869, radiusKm: 15 } });
        assert.equal(c.status, 201);
        assert.ok((await api('GET', '/api/v1/areas')).body.areas.find((a) => a.name === 'سيئون'));
        assert.equal(t.app.catalog.resolveArea(15.94, 48.78).id, c.body.area.id);
        assert.equal((await api('PATCH', `/api/v1/admin/areas/${c.body.area.id}`, { token: admin, body: { isActive: false } })).status, 200);
        assert.ok(!(await api('GET', '/api/v1/areas')).body.areas.find((a) => a.name === 'سيئون'), 'المنطقة المعطلة لا تظهر للعملاء');
        assert.equal(t.app.catalog.resolveArea(15.94, 48.78)?.type, 'COUNTRY');
    });
    test('منطقة بإحداثيات أو أب غير صالح → 422، والعميل ممنوع', async () => {
        const admin = await loginAdmin(api);
        assert.equal((await api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'س' }, type: 'CITY', centerLat: 99, centerLng: 0 } })).status, 422);
        assert.equal((await api('POST', '/api/v1/admin/areas', { token: admin, body: { name: { ar: 'س' }, type: 'CITY', centerLat: 1, centerLng: 1, parentId: 'nope' } })).status, 422);
        const c = await registerUser(api);
        assert.equal((await api('POST', '/api/v1/admin/areas', { token: c.body.accessToken, body: { name: { ar: 'س' }, type: 'CITY', centerLat: 1, centerLng: 1 } })).status, 403);
    });
});
describe('المنطقة الزمنية Asia/Aden في حساب التوفر', () => {
    test('الاثنين 09:00 بتوقيت عدن (UTC+3) = 06:00 UTC: متاح ضمن 09:00-17:00 وغير متاح 08:59', async () => {
        const { isProviderAvailable } = await import('../src/ports/matching.js');
        const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN' } });
        const pid = (await api('GET', '/api/v1/auth/me', { token: p.body.accessToken })).body.provider.id;
        await api('PUT', '/api/v1/provider/availability', { token: p.body.accessToken, body: { slots: [{ weekday: 1, start: '09:00', end: '17:00' }] } });
        const tz = t.app.settings.get('platform.timezone');
        assert.equal(tz, 'Asia/Aden');
        assert.equal(isProviderAvailable(t.app.db, pid, Date.parse('2026-09-21T06:00:00Z'), tz), true); // الاثنين 09:00 عدن
        assert.equal(isProviderAvailable(t.app.db, pid, Date.parse('2026-09-21T05:59:00Z'), tz), false); // 08:59 عدن
        assert.equal(isProviderAvailable(t.app.db, pid, Date.parse('2026-09-21T14:00:00Z'), tz), false); // 17:00 عدن (نهاية حصرية)
        assert.equal(isProviderAvailable(t.app.db, pid, Date.parse('2026-09-22T06:00:00Z'), tz), false); // الثلاثاء
    });
});
//# sourceMappingURL=defaults.test.js.map