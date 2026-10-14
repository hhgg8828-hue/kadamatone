import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { startApp } from './helpers.js';
const runtimeRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourceRoot = path.resolve(runtimeRoot, '..');
const publicDir = path.join(sourceRoot, 'public');
const frontend = fs.readFileSync(path.join(publicDir, 'app.ts'), 'utf8');
const httpSource = fs.readFileSync(path.join(sourceRoot, 'src', 'core', 'http.ts'), 'utf8');
test('guest service selection opens service details before requesting authentication', () => {
    assert.match(frontend, /async function openServiceDetails\(/);
    assert.match(frontend, /تسجيل الدخول لطلب الخدمة/);
    assert.match(frontend, /localStorage\.setItem\('khadamat\.pendingCustomerRequest\.v1',serviceId\)/);
    assert.match(frontend, /if\(!state\.user\)\{openServiceDetails\(serviceId,initial\);return\}/);
    assert.match(frontend, /يمكنك الاطلاع على الخدمة أولًا/);
});
test('mobile car wash no longer asks a redundant current/other location question and still requires a confirmed location', () => {
    assert.match(frontend, /'mobile-car-wash':\['أحتاج غسيل السيارة في موقعي'/);
    assert.ok(!/name="carWashLocationChoice" value="other"/.test(frontend));
    assert.ok(!/هل تريد غسيل السيارة في موقعك الحالي/.test(frontend));
    assert.match(frontend, /if\(s\.slug==='mobile-car-wash'\)/);
    assert.match(frontend, /حدّد موقعك الحالي عبر GPS وأكّده قبل إرسال طلب غسيل السيارة/);
    assert.match(frontend, /f\.required\?'<option value="">اختر الخيار<\/option>'/);
});
test('customer area picker uses a compact area-name list without displaying administrative levels', () => {
    assert.match(frontend, /function openCustomerAreaPicker\(\)/);
    assert.match(frontend, /data-select-area=/);
    assert.match(frontend, /state\.areas\.some\(\(a:any\)=>a\.id===storedArea\)/);
    assert.ok(!/المحافظة \/ المنطقة \/ الحي/.test(frontend));
    assert.match(frontend, /customer-area-option/);
    assert.match(frontend, /api\('\/admin\/areas'/);
    assert.match(frontend, /api\('\/provider\/areas'/);
});
test('provider login canonicalizes to /provider and area/confirmation UI fixes are present', () => {
    assert.match(frontend, /function roleHome\(role:string\)\{return role==='PROVIDER'\?'\/provider'/);
    assert.match(frontend, /providerData\.areas\|\|providerData\.serviceAreas/);
    assert.match(frontend, /function areaPathLabel\(/);
    assert.match(frontend, /هاتف العميل المسجل/);
    assert.match(frontend, /tel:\$\{esc\(phoneHref\(x\.phone\)\)\}/);
});
test('HTML shells are not cached and deployment checks require admin/provider shells', () => {
    assert.match(httpSource, /rel === '\/admin' \|\| rel === '\/admin\/'/);
    assert.match(httpSource, /rel === '\/provider' \|\| rel === '\/provider\/'/);
    assert.match(httpSource, /no-store, max-age=0, must-revalidate/);
    const server = fs.readFileSync(path.join(sourceRoot, 'src', 'server.ts'), 'utf8');
    assert.match(server, /'provider\.html', 'admin\.html', 'js\/app\.js', 'sw\.js'/);
});
test('direct /admin, /provider, and /customer paths and refreshes serve the correct interface shells', async () => {
    const t = await startApp();
    try {
        for (const [route, expected] of [['/admin', 'data-page="admin"'], ['/admin/', 'data-page="admin"'], ['/admin.html', 'data-page="admin"'], ['/provider', 'data-page="provider"'], ['/provider/', 'data-page="provider"'], ['/provider.html', 'data-page="provider"'], ['/customer', 'data-page="customer"'], ['/customer.html', 'data-page="customer"']]) {
            const res = await t.api('GET', route);
            assert.equal(res.status, 200, `${route} should return HTTP 200`);
            assert.match(res.headers.get('content-type') || '', /text\/html/);
            assert.ok(res.text.includes(expected), `${route} should render ${expected}`);
            // A second GET models a direct reload/refresh rather than in-app navigation.
            const refreshed = await t.api('GET', route);
            assert.equal(refreshed.status, 200, `${route} refresh should return HTTP 200`);
            assert.ok(refreshed.text.includes(expected));
        }
        const assets = await t.api('GET', '/js/app.js?v=2.29');
        assert.equal(assets.status, 200);
        assert.match(assets.headers.get('content-type') || '', /javascript/);
        assert.ok(assets.text.length > 1000);
        const adminApi = await t.api('GET', '/api/v1/admin/dashboard');
        assert.ok([401, 403].includes(adminApi.status), 'admin API must remain protected');
        const providerApi = await t.api('GET', '/api/v1/provider/profile');
        assert.ok([401, 403].includes(providerApi.status), 'provider API must remain protected');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_8_guest_service_and_routes.test.js.map