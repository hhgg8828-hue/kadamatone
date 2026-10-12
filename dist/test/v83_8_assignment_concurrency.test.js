import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });
async function makeOrderAndProvider(suffix) {
    const c = await registerUser(t.api);
    const p = await registerUser(t.api, { role: 'PROVIDER', email: `v838-${suffix}-${Date.now()}@test.local`, provider: { providerType: 'DRIVER', displayName: `مقدم ${suffix}` } });
    const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
    const svc = cats.flatMap((x) => x.services || []).find((x) => x.slug !== 'motorcycle-trips');
    assert.ok(svc);
    const created = await t.api('POST', '/api/v1/orders', { token: c.body.accessToken, body: { serviceId: svc.id, description: `اختبار التزامن ${suffix}`, contactPhone: c.creds.phone, location: { lat: 13.9759, lng: 44.1709 }, formData: { hours: 1 } } });
    assert.equal(created.status, 201, created.text);
    const providerId = t.app.db.get('SELECT id FROM service_providers WHERE user_id=?', p.body.user.id)?.id;
    assert.ok(providerId);
    return { orderId: created.body.order.id, providerId, provider: p, customer: c };
}
function addOffer(orderId, providerId, id) {
    const now = new Date().toISOString();
    t.app.db.run("INSERT INTO order_assignments(id,order_id,provider_id,status,wave,offered_at,expires_at) VALUES(?,?,?,'OFFERED',1,?,?)", id, orderId, providerId, now, new Date(Date.now() + 120_000).toISOString());
}
test('V83.8: رفض عرض لا يطلق موجة إضافية ما دام عرض آخر ساريًا', async () => {
    const a = await makeOrderAndProvider('wave-a');
    const b = await makeOrderAndProvider('wave-b');
    addOffer(a.orderId, a.providerId, `offer-a-${Date.now()}`);
    addOffer(a.orderId, b.providerId, `offer-b-${Date.now()}`);
    const before = t.app.db.get("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND status='OFFERED'", a.orderId).n;
    const result = t.app.assignment.assignWave(a.orderId);
    const afterCount = t.app.db.get("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND status='OFFERED'", a.orderId).n;
    assert.equal(result.offered, 0);
    assert.equal(afterCount, before);
});
test('V83.8: لا يمكن لمقدمين قبول الطلب نفسه بنجاح', async () => {
    const a = await makeOrderAndProvider('race-a');
    const b = await makeOrderAndProvider('race-b');
    const offerA = `race-offer-a-${Date.now()}`;
    const offerB = `race-offer-b-${Date.now()}`;
    addOffer(a.orderId, a.providerId, offerA);
    addOffer(a.orderId, b.providerId, offerB);
    const responses = await Promise.all([
        t.api('POST', `/api/v1/provider/offers/${offerA}/accept`, { token: a.provider.body.accessToken, body: {} }),
        t.api('POST', `/api/v1/provider/offers/${offerB}/accept`, { token: b.provider.body.accessToken, body: {} }),
    ]);
    assert.equal(responses.filter((r) => r.status === 200).length, 1, responses.map((r) => `${r.status}: ${r.text}`).join('\n'));
    assert.equal(responses.filter((r) => r.status === 409).length, 1, responses.map((r) => `${r.status}: ${r.text}`).join('\n'));
    const order = t.app.db.get('SELECT status,provider_id FROM orders WHERE id=?', a.orderId);
    assert.equal(order.status, 'ACCEPTED');
    assert.ok([a.providerId, b.providerId].includes(order.provider_id));
    assert.equal(t.app.db.get("SELECT COUNT(*) n FROM order_assignments WHERE order_id=? AND status='ACCEPTED'", a.orderId).n, 1);
});
test('V83.8: واجهات PWA وذاكرة التخزين المؤقت تحمل رقم الإصدار الحالي', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.19'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-19'));
});
//# sourceMappingURL=v83_8_assignment_concurrency.test.js.map