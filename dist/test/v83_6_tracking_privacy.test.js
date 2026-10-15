import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('V83.6: الموقع الحي مرتبط بحالة الطلب وليس بموقع مقدم الخدمة العام', () => {
    const tracking = fs.readFileSync('src/modules/tracking.ts', 'utf8');
    assert.match(tracking, /const LIVE_TRIP_STATUSES=new Set\(\['ACCEPTED','ON_THE_WAY','IN_PROGRESS'\]\)/);
    assert.match(tracking, /function liveForOrder\(app:App,order:\{status:string;provider_id:string\|null\}\)/);
    assert.match(tracking, /app\.clock\.now\(\)-updated>120_000/);
    assert.match(tracking, /location:liveForOrder\(app,o\)/);
    assert.match(tracking, /const current=liveForOrder\(app,o\)/);
});
test('V83.6: الروابط العامة لا تخلط موقع مقدم الخدمة الحالي مع مسار طلب مكتمل', () => {
    const tracking = fs.readFileSync('src/modules/tracking.ts', 'utf8');
    const route = tracking.slice(tracking.indexOf("r.get('/shared-trips/:token/route'"), tracking.indexOf("r.get('/admin/live-providers'"));
    assert.match(route, /SELECT id,status,provider_id,location_id FROM orders/);
    assert.equal(/o\.provider_id\?live\(app,o\.provider_id\):null/.test(route), false);
});
test('V83.6: كل واجهات PWA تستخدم أصول الإصدار الجديد', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.66.1'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-66-1'));
});
//# sourceMappingURL=v83_6_tracking_privacy.test.js.map