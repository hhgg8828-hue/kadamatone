import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, loginAdmin } from './helpers.js';
let t, api;
before(async () => { t = await startApp(); api = t.api; });
after(async () => { await t.close(); });
test('تنفيذ طلب خدمة قصيرة الاسم أُضيفت حديثًا إلى قسم مخصص', async () => {
    const admin = await loginAdmin(api);
    const category = await api('POST', '/api/v1/admin/categories', {
        token: admin,
        body: { slug: 'travel-visa-test', name: { ar: 'سفريات السياحة', en: 'Travel and Tourism' }, icon: '✈️' },
    });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    const service = await api('POST', '/api/v1/admin/services', {
        token: admin,
        body: {
            categoryId: category.body.category.id,
            slug: 'visa-short-name-test',
            name: { ar: 'فيزا', en: 'Visa' },
            pricingType: 'QUOTE',
            formSchema: [],
        },
    });
    assert.equal(service.status, 201, JSON.stringify(service.body));
    const customer = await registerUser(api);
    const result = await api('POST', '/api/v1/orders', {
        token: customer.body.accessToken,
        headers: { 'Idempotency-Key': 'v267-short-description' },
        body: { serviceId: service.body.service.id, description: 'فيزا', contactPhone: '+967771112233' },
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.order.service.name, 'فيزا');
    assert.equal(result.body.order.description, 'فيزا');
});
//# sourceMappingURL=v2_67_short_service_description.test.js.map