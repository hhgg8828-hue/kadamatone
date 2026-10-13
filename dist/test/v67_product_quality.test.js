import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';
test('V67: الطلب اليومي المركب يُفهم من صياغة يمنية طبيعية', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const r = await t.api('POST', '/api/v1/assist/request', { token: c.body.accessToken, body: { text: 'لو سمحت أريد واحد يشتري لي بيبسي ويوصله إلى البيت اليوم' } });
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.recommended?.serviceSlug, 'purchase-and-delivery');
        assert.equal(r.body.extracted?.structured?.taskType, 'PURCHASE_AND_DELIVERY');
        assert.ok(r.body.extracted?.structured?.item);
    }
    finally {
        await t.close();
    }
});
test('V67: النص غير المطابق لا ينتهي بطريق مسدود ويُعامل كطلب خاص', async () => {
    const t = await startApp();
    try {
        const c = await registerUser(t.api);
        const r = await t.api('POST', '/api/v1/search/intent', { token: c.body.accessToken, body: { text: 'أحتاج شخص يساعدني في أمر خاص في قرية بعيدة لا أعرف له اسم خدمة' } });
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.extracted?.structured?.taskType, 'CUSTOM');
        assert.ok((r.body.clarification?.options || []).some((x) => x.label === 'طلب خدمة أخرى'));
    }
    finally {
        await t.close();
    }
});
//# sourceMappingURL=v67_product_quality.test.js.map