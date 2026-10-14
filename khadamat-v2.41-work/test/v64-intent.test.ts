import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';

test('V64: اطلب لي يكتشف النية والطلب المركب والاتجاه بين المدينة والقرية', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد واحد يشتري لي غرض من المدينة ويجيبه للقرية'}});
    assert.equal(r.status,200,r.text);
    assert.equal(r.body.extracted.purchaseIntent,true);
    assert.equal(r.body.extracted.destinationHint,'CITY_TO_VILLAGE');
    assert.equal(r.body.extracted.compound,true);
    assert.equal(r.body.recommended.serviceSlug,'purchase-and-delivery');
    assert.ok(r.body.steps.length>=1);
  }finally{await t.close()}
});

test('V64: الطلب الغامض يعيد سؤال توضيحيًا واحدًا بدل محادثة طويلة', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد واحد يساعدني'}});
    assert.equal(r.status,200,r.text);
    assert.ok(r.body.clarification);
    assert.ok(r.body.clarification.question);
    assert.ok(r.body.clarification.options.length<=3);
  }finally{await t.close()}
});

test('V64: المساعد الذكي اختياري ولا يعطل اطلب لي عند غياب إعداد AI', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد واحد يصلح المكيف'}});
    assert.equal(r.status,200,r.text);
    assert.equal(r.body.source,'RULES');
    assert.equal(r.body.recommended.serviceSlug,'air-conditioning');
  }finally{await t.close()}
});

test('V64.1: طبقة AI تعمل تلقائيًا عند الغموض وتستطيع اختيار خدمة لم يكتشفها المحلل المحلي', async()=>{
  const t=await startApp({OPENAI_API_KEY:'test-key',AI_INTENT_AUTO:'true',AI_INTENT_TIMEOUT_MS:'1000'});
  const originalFetch=globalThis.fetch;
  try{
    let called=0;
    const airId= t.app.catalog.all().services.find((x:any)=>x.slug==='air-conditioning')?.id;
    assert.ok(airId);
    globalThis.fetch=(async()=>{
      called++;
      return { ok:true, status:200, json:async()=>({choices:[{message:{content:JSON.stringify({serviceIds:[airId],confidence:0.93})}}]}) } as any;
    }) as typeof fetch;
    const result=await t.app.intentParser.parse('أحتاج فني يصلح جهاز التبريد في البيت',{catalog:t.app.catalog,locale:'ar'});
    assert.equal(called,1);
    assert.equal(result.source,'AI');
    assert.equal(result.matches[0]?.serviceSlug,'air-conditioning');
    assert.equal(result.clarification,null);
  }finally{
    globalThis.fetch=originalFetch;
    await t.close();
  }
});

test('V64.1: تعطل AI لا يعطل اطلب لي ويفتح قاطعًا مؤقتًا بعد تكرار الفشل', async()=>{
  const t=await startApp({OPENAI_API_KEY:'test-key',AI_INTENT_AUTO:'true',AI_INTENT_TIMEOUT_MS:'50',AI_INTENT_CIRCUIT_COOLDOWN_MS:'60000'});
  const originalFetch=globalThis.fetch;
  try{
    let called=0;
    globalThis.fetch=(async()=>{ called++; throw new Error('provider down'); }) as typeof fetch;
    for(let i=0;i<3;i++){
      const result=await t.app.intentParser.parse('أريد واحد يصلح المكيف',{catalog:t.app.catalog,locale:'ar'});
      assert.equal(result.source,'RULES_AI_FALLBACK');
      assert.equal(result.matches[0]?.serviceSlug,'air-conditioning');
    }
    const before=called;
    const result=await t.app.intentParser.parse('أريد واحد يصلح المكيف',{catalog:t.app.catalog,locale:'ar'});
    assert.equal(result.source,'RULES');
    assert.equal(result.matches[0]?.serviceSlug,'air-conditioning');
    assert.equal(called,before);
  }finally{
    globalThis.fetch=originalFetch;
    await t.close();
  }
});
