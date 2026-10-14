import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp } from './helpers.js';

test('V65.1: صورة الدواء تجعل اطلب لي يركز على خدمة الدواء ولا يحولها إلى طلب مركب', async()=>{
  const t=await startApp({OPENAI_API_KEY:'test-key',AI_INTENT_AUTO:'true',AI_INTENT_TIMEOUT_MS:'1000'});
  const originalFetch=globalThis.fetch;
  try{
    const pharmacyId=t.app.catalog.all().services.find((x:any)=>x.slug==='pharmacy-purchase')?.id;
    assert.ok(pharmacyId);
    let body:any;
    globalThis.fetch=(async(_url:any,init:any)=>{
      body=JSON.parse(init.body);
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({serviceIds:[pharmacyId],confidence:0.98})}}]})} as any;
    }) as typeof fetch;
    const result=await t.app.intentParser.parse('هذا الدواء ابحث واقترح الخدمة المناسبة',{catalog:t.app.catalog,locale:'ar',image:{mime:'image/jpeg',dataBase64:'ZmFrZQ=='}});
    assert.equal(result.source,'AI');
    assert.equal(result.matches[0]?.serviceSlug,'pharmacy-purchase');
    assert.equal(result.steps.length,1);
    assert.equal(result.extracted.compound,false);
    assert.equal(result.steps[0]?.reason,'يتوافق مع محتوى الصورة والطلب');
    assert.ok(String(body.messages?.[1]?.content?.[0]?.text||'').includes('هذا الدواء'));
    assert.equal(body.messages?.[1]?.content?.[1]?.type,'image_url');
  }finally{
    globalThis.fetch=originalFetch;
    await t.close();
  }
});

test('V65.1: الصورة لا تسمح بإضافة خدمة غير مرتبطة عندما يعيد مزود AI أكثر من خدمة بالخطأ', async()=>{
  const t=await startApp({OPENAI_API_KEY:'test-key',AI_INTENT_AUTO:'true'});
  const originalFetch=globalThis.fetch;
  try{
    const pharmacyId=t.app.catalog.all().services.find((x:any)=>x.slug==='pharmacy-purchase')?.id;
    const constructionId=t.app.catalog.all().services.find((x:any)=>x.slug==='construction-worker')?.id;
    assert.ok(pharmacyId); assert.ok(constructionId);
    globalThis.fetch=(async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({serviceIds:[pharmacyId,constructionId],confidence:0.96})}}]})}) as any) as typeof fetch;
    const result=await t.app.intentParser.parse('صورة الدواء',{catalog:t.app.catalog,locale:'ar',image:{mime:'image/jpeg',dataBase64:'ZmFrZQ=='}});
    assert.equal(result.steps.length,1);
    assert.equal(result.steps[0]?.serviceSlug,'pharmacy-purchase');
    assert.equal(result.extracted.compound,false);
  }finally{
    globalThis.fetch=originalFetch;
    await t.close();
  }
});

test('V65.2: وجود صورة يفرض فحص AI حتى لو كان النص المحلي واضحًا', async()=>{
  const t=await startApp({OPENAI_API_KEY:'test-key',AI_INTENT_AUTO:'true'});
  const originalFetch=globalThis.fetch;
  try{
    const pharmacyId=t.app.catalog.all().services.find((x:any)=>x.slug==='pharmacy-purchase')?.id;
    assert.ok(pharmacyId);
    let calls=0;
    globalThis.fetch=(async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({serviceIds:[pharmacyId],confidence:0.99})}}]})} as any}) as typeof fetch;
    const result=await t.app.intentParser.parse('دواء',{catalog:t.app.catalog,locale:'ar',image:{mime:'image/jpeg',dataBase64:'ZmFrZQ=='}});
    assert.equal(calls,1);
    assert.equal(result.source,'AI');
    assert.equal(result.matches.length,1);
    assert.equal(result.matches[0]?.serviceSlug,'pharmacy-purchase');
  }finally{globalThis.fetch=originalFetch;await t.close();}
});

