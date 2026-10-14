import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('V2.32 uses one service-specific description field instead of duplicate generic questions', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
    assert.ok(flow.includes('const hasDedicatedDescription='));
    assert.ok(flow.includes("const quantityFieldsHtml=quantityFields.map(renderField).join('')"));
    assert.ok(flow.includes('${quantityFieldsHtml}${optionalFieldsHtml}'));
    assert.ok(flow.includes('const descriptionFieldHtml=hasDedicatedDescription?\'\':'));
    assert.ok(flow.includes('ما المطلوب|اسم الدواء|الغرض المطلوب'));
    assert.ok(!flow.includes('id="orderProductUrl"'));
});
test('V2.32 shows entered service details in a table at form preview and order confirmation', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
    assert.ok(flow.includes('const orderDetailRows='));
    assert.ok(flow.includes('class="order-details-table"'));
    assert.ok(flow.includes('${orderDetailRows(fdReview).join(\'\')}'));
    assert.ok(flow.includes('<th scope="row">رقم التواصل</th>'));
    assert.ok(flow.includes('name="reviewOrderTime" value="now" checked'));
    assert.ok(flow.includes('id="reviewConfirmOrder">تنفيذ الطلب</button>'));
});
test('V2.32 confirmation no longer asks for a second extra product after the customer completed the service form', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const flow = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('function renderOrderTimeline'));
    assert.ok(!flow.includes('id="customProductName"'));
    assert.ok(!flow.includes('id="reviewExtraDetails"'));
    assert.ok(!flow.includes('منتج إضافي (اختياري)'));
    assert.ok(flow.includes('id="reviewOrderNote"'));
});
test('V2.32 app assets and service-worker cache are aligned', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.32'), file);
        assert.ok(html.includes('app.css?v=2.32'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-32'));
});
//# sourceMappingURL=v2_32_order_checkout_reference.test.js.map