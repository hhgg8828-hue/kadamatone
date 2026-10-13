import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Release 2.9 keeps optional order details collapsed by default', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const form = app.slice(app.indexOf('async function openOrderForm(serviceId:string'), app.indexOf('async function openOrderComplaint'));
    assert.ok(form.includes('<details class="optional-order-details order-advanced-area"><summary>تحديد منطقة أدق (اختياري)</summary>'));
    assert.ok(form.includes('<details class="optional-order-details beneficiary-first"><summary>مستفيد آخر (اختياري)</summary>'));
    assert.ok(form.includes('<details class="optional-order-details"><summary>إضافات اختيارية</summary>'));
    assert.ok(form.includes('id="orderDescription" name="description" required'));
    assert.ok(form.includes('id="submitOrderBtn" type="submit">تنفيذ الطلب</button>'));
});
test('Release 2.11 hides internal status events from customer tracking in order tracking', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const view = app.slice(app.indexOf('async function openOrder(id:string)'), app.indexOf('async function openSavedLocations'));
    assert.ok(view.includes('class="order-current-status"'));
    assert.ok(view.includes('class="card order-tracking-summary"'));
    assert.ok(view.includes('id="openChatBtn"'));
    assert.ok(view.includes('id="trackTripBtn"'));
    assert.ok(view.includes('<h3>معلومات الطلب</h3>'));
    assert.ok(view.includes('<h3>نوع الخدمة</h3>'));
    assert.ok(!view.includes('class="order-latest-update"'));
    assert.ok(!view.includes('<summary>تفاصيل إضافية</summary>'));
    assert.ok(!view.includes('الملخص المالي'));
});
test('Release 2.9 keeps core order actions available in the compact tracking screen', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    const view = app.slice(app.indexOf('async function openOrder(id:string)'), app.indexOf('async function openSavedLocations'));
    for (const id of ['cancel', 'complaintBtn', 'openRatingBtn', 'openQuotesBtn', 'approvePurchaseChange', 'rejectPurchaseChange', 'customerRecipientConfirmBtn', 'shareTripBtn']) {
        assert.ok(view.includes(`id="${id}"`), `missing retained order action: ${id}`);
    }
});
//# sourceMappingURL=v89_order_flow_simplification.test.js.map