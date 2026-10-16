import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';
test('V2.84: additional service details are validated and stored independently, and quantity is enforced per service', async () => {
    const t = await startApp();
    try {
        const customer = await registerUser(t.api);
        const cats = (await t.api('GET', '/api/v1/categories')).body.categories;
        const services = cats.flatMap((c) => c.services || []).filter((s) => s.isActive !== false);
        assert.ok(services.length >= 2, 'seed catalog must have at least two active services');
        const primary = services[0];
        const extra = services.find((s) => s.id !== primary.id);
        const fixedSchema = [
            { key: 'quantity', type: 'number', label: { ar: 'الكمية', en: 'Quantity' }, required: false, min: 1, max: 999 },
            { key: 'recipientNote', type: 'text', label: { ar: 'تفاصيل الخدمة الإضافية', en: 'Extra service details' }, required: true, maxLength: 200 },
        ];
        t.app.db.run('UPDATE services SET form_schema=? WHERE id=?', JSON.stringify(fixedSchema), extra.id);
        t.app.catalog.invalidate();
        const missingRequired = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: {
                serviceId: primary.id, description: 'طلب أساسي مع خدمة إضافية', contactPhone: '+967771234567',
                additionalServices: [{ serviceId: extra.id, quantity: 2, formData: {} }],
            } });
        assert.equal(missingRequired.status, 422, missingRequired.text);
        const created = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: {
                serviceId: primary.id, description: 'طلب أساسي مع تفاصيل إضافية', contactPhone: '+967771234567',
                additionalServices: [{ serviceId: extra.id, quantity: 2, formData: { recipientNote: 'اللون والحجم المطلوبان' } }],
            } });
        assert.equal(created.status, 201, created.text);
        const saved = t.app.db.get('SELECT form_data FROM orders WHERE id=?', created.body.order.id);
        const data = JSON.parse(saved.form_data);
        assert.equal(data.additionalServices[0].quantity, 2);
        assert.equal(data.additionalServices[0].formData.recipientNote, 'اللون والحجم المطلوبان');
        const noQty = services.find((s) => s.id !== primary.id && s.id !== extra.id);
        if (noQty) {
            t.app.db.run('UPDATE services SET form_schema=? WHERE id=?', JSON.stringify([{ key: 'descriptionExtra', type: 'text', label: { ar: 'تفاصيل', en: 'Details' }, required: false }]), noQty.id);
            t.app.catalog.invalidate();
            const invalidQuantity = await t.api('POST', '/api/v1/orders', { token: customer.body.accessToken, body: {
                    serviceId: primary.id, description: 'طلب لا يسمح بكمية متعددة', contactPhone: '+967771234567',
                    additionalServices: [{ serviceId: noQty.id, quantity: 2 }],
                } });
            assert.equal(invalidQuantity.status, 422, invalidQuantity.text);
            assert.equal(invalidQuantity.body.error.code, 'SERVICE_DOES_NOT_SUPPORT_QUANTITY');
        }
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v2_84_compound_services.test.js.map