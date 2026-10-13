import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';
test('نظام المشاوير: تقدير المسافة والأجرة من الإحداثيات', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const estimate = await t.api('POST', '/api/v1/trips/estimate', { token: customer.body.accessToken, body: {
                origin: { lat: 15.3694, lng: 44.1910 }, destination: { lat: 15.3794, lng: 44.1910 }
            } });
        assert.equal(estimate.status, 200);
        assert.ok(estimate.body.distanceKm > 1);
        assert.equal(estimate.body.currency, 'YER');
        assert.ok(estimate.body.fare >= estimate.body.minimumFare);
    }
    finally {
        await t.close();
    }
});
test('نظام المشاوير: إنشاء مشوار يحفظ الوجهة والمسافة والأجرة ويدخل دورة الإسناد', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const res = await t.api('POST', '/api/v1/trips', { token: customer.body.accessToken, body: {
                origin: { lat: 15.3694, lng: 44.1910, addressText: 'نقطة الانطلاق قرب شارع رئيسي', source: 'map' },
                destination: { lat: 15.3794, lng: 44.1910, addressText: 'الوجهة بجوار السوق', source: 'map' },
                purpose: 'PASSENGER', description: 'أحتاج مشوارًا إلى الوجهة المحددة', contactPhone: customer.creds.phone
            } });
        assert.equal(res.status, 201, res.text);
        const id = res.body.order.id;
        assert.equal(res.body.order.service.name, 'مشاوير بالدباب');
        assert.equal(res.body.order.trip.purpose, 'PASSENGER');
        assert.ok(res.body.order.trip.distanceKm > 1);
        assert.ok(res.body.order.trip.fare >= res.body.order.trip.pricing.minimumFare);
        const row = t.app.db.get('SELECT * FROM trip_orders WHERE order_id=?', id);
        assert.ok(row);
        assert.equal(row.purpose, 'PASSENGER');
        assert.equal(row.currency, 'YER');
        const detail = await t.api('GET', `/api/v1/orders/${id}`, { token: customer.body.accessToken });
        assert.equal(detail.status, 200);
        assert.equal(detail.body.order.trip.destination.addressText, 'الوجهة بجوار السوق');
    }
    finally {
        await t.close();
    }
});
test('نظام المشاوير: نقاط الخريطة يمكن أن تكون بلا اسم ولا تعتمد على منطقة مسماة', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const res = await t.api('POST', '/api/v1/trips', { token: customer.body.accessToken, body: {
                origin: { lat: 13.9761, lng: 44.1712, source: 'map' },
                destination: { lat: 13.9861, lng: 44.1812, source: 'map' },
                purpose: 'OTHER', description: 'مشوار إلى نقطة محددة على الخريطة بدون اسم', contactPhone: customer.creds.phone
            } });
        assert.equal(res.status, 201, res.text);
        assert.equal(typeof res.body.order.trip.destination.lat, 'number');
        assert.equal(typeof res.body.order.trip.destination.lng, 'number');
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=trips.test.js.map