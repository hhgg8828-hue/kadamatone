import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startApp } from './helpers.js';
test('Release 2.6 customer order details use readable location text and a map link, not raw coordinates', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('function renderCustomerLocationDetails(location:any):string'));
    assert.ok(app.includes('📍 عرض الموقع على الخريطة'));
    assert.ok(app.includes('تم تحديد موقع الخدمة على الخريطة، لكن لم يُدخل عنوان تفصيلي.'));
    assert.ok(app.includes('<b>📝 ماذا تحتاج؟</b>'));
    const customerOrderView = app.slice(app.indexOf('async function openOrder(id:string)'), app.indexOf('async function openProviderOrder'));
    assert.ok(customerOrderView.length > 0);
    assert.ok(!customerOrderView.includes('الإحداثيات المحفوظة مع الطلب'));
    assert.ok(!customerOrderView.includes('Number(o.location.lat).toFixed(6)'));
    assert.ok(!customerOrderView.includes('Number(o.trip.destination.lat).toFixed(6)'));
});
test('Release 2.6 maps Yemeni worker synonyms to daily-worker', async () => {
    const t = await startApp();
    try {
        for (const text of ['أريد شاغل يشتغل معي', 'أريد شغال', 'أريد واحد يشتغل معي']) {
            const result = await t.api('POST', '/api/v1/search/intent', { body: { text } });
            assert.equal(result.status, 200, result.text);
            assert.equal(result.body.matches[0]?.serviceSlug, 'daily-worker', text);
        }
    }
    finally {
        await t.close();
    }
});
test('Release 2.6 maps agriculture help requests to farm-worker rather than generic labor', async () => {
    const t = await startApp();
    try {
        for (const text of ['أريد أحد يعاوني في الزراعة', 'أحتاج شغال في المزرعة', 'أريد عامل زراعة']) {
            const result = await t.api('POST', '/api/v1/search/intent', { body: { text } });
            assert.equal(result.status, 200, result.text);
            assert.equal(result.body.matches[0]?.serviceSlug, 'farm-worker', text);
        }
    }
    finally {
        await t.close();
    }
});
test('Release 2.6 keeps specific labor categories ahead of generic daily labor', async () => {
    const t = await startApp();
    try {
        const construction = await t.api('POST', '/api/v1/search/intent', { body: { text: 'أريد عامل بناء' } });
        assert.equal(construction.body.matches[0]?.serviceSlug, 'construction-worker');
        const loading = await t.api('POST', '/api/v1/search/intent', { body: { text: 'أريد عامل تحميل وتنزيل' } });
        assert.equal(loading.body.matches[0]?.serviceSlug, 'loading-worker');
    }
    finally {
        await t.close();
    }
});
test('Release 2.6 uses the current cache identifiers in all app shells', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('v=2.8'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-8'));
});
//# sourceMappingURL=v88_order_tracking_intent.test.js.map