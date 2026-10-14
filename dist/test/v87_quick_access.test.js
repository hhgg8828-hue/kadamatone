import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Release 2.5 quick access is compact and contains only text entry plus voice control', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('id="quickAssistForm"'));
    assert.ok(app.includes('id="quickAssistText"'));
    assert.ok(app.includes('id="quickAssistVoice"'));
    assert.ok(app.includes('placeholder="مثال: أريد واحد يشتري لي بيبسي ويوصله للبيت"'));
    assert.ok(!app.includes('id="simpleRequestForm"'));
    assert.ok(!app.includes('id="simpleLocationLabel"'));
    assert.ok(!app.includes('id="simpleRequestSubmit"'));
    assert.ok(!app.includes('id="simpleRequestImage"'));
});
test('Quick access searches automatically and restricts suggestions to the loaded active-area catalog', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes("api('/search/intent',{method:'POST',body:JSON.stringify({text:q})})"));
    assert.ok(app.includes('window.setTimeout(()=>{searchNow(q).catch(()=>{});},450)'));
    assert.ok(app.includes('new Set((state.services||[]).map((x:any)=>String(x.id)))'));
    assert.ok(app.includes('activeIds.has(String(m.serviceId))'));
    assert.ok(app.includes('sequence!==requestSequence'));
});
test('Selecting a suggested service does not create an order and preserves the description for review', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes("openServiceDetails(serviceId,{description:q})"));
    assert.ok(app.includes("localStorage.setItem('khadamat.pendingRequestDescription.v1',String(initial.description).slice(0,1000))"));
    assert.ok(app.includes('اختر الخدمة المناسبة؛ لن يُرسل أي طلب قبل مراجعتك وتأكيدك.'));
    assert.ok(!app.includes("api('/orders',{method:'POST',headers:{'Idempotency-Key':newIdempotencyKey()},body:JSON.stringify(body)});\n      toast('تم إرسال طلبك'"));
});
test('Unmatched needs have a dedicated custom-service path with the original description', () => {
    const app = fs.readFileSync('public/app.ts', 'utf8');
    assert.ok(app.includes('طلب خدمة غير موجودة'));
    assert.ok(app.includes("openOrderFormBySlug('custom-request',{description:q})"));
    assert.ok(app.includes('async function openOrderFormBySlug(slug:string,initial:any=null)'));
});
test('Release 2.5 keeps public asset cache identifiers aligned', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.38'), file);
        assert.ok(html.includes('app.css?v=2.38'), file);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-38'));
});
//# sourceMappingURL=v87_quick_access.test.js.map