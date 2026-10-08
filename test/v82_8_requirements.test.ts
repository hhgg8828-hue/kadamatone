import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser } from './helpers.js';

let t: Awaited<ReturnType<typeof startApp>>;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

test('V82.8: الطلب يبقى مفتوحًا بلا مهلة عمر ويصل لمقدم الخدمة عند فتح الاستقبال لاحقًا', async () => {
  const c = await registerUser(t.api); const ct = c.body.accessToken as string;
  const p = await registerUser(t.api, { role:'PROVIDER', email:`v828-open-${Date.now()}@test.local`, provider:{ providerType:'DRIVER', displayName:'مقدم طلب قديم' } });
  const pt = p.body.accessToken as string;
  const me = await t.api('GET','/api/v1/auth/me',{token:pt}); const pid = me.body.provider.id as string;
  t.app.db.run(`UPDATE service_providers SET verification_status='VERIFIED', verified_at=? WHERE id=?`, new Date().toISOString(), pid);
  await t.api('PATCH','/api/v1/provider/profile',{token:pt,body:{baseLocation:{lat:13.9759,lng:44.1709}}});
  const cats=(await t.api('GET','/api/v1/categories')).body.categories;
  const svc=cats.flatMap((x:any)=>x.services||[]).find((x:any)=>x.slug==='air-conditioning') || cats.flatMap((x:any)=>x.services||[]).find((x:any)=>x.slug!=='motorcycle-trips');
  await t.api('PUT','/api/v1/provider/services',{token:pt,body:{services:[{serviceId:svc.id,experienceYears:1}]}});
  await t.api('POST','/api/v1/provider/online',{token:pt,body:{online:true}});
  await t.api('POST','/api/v1/provider/accepting-orders',{token:pt,body:{accepting:false}});
  const order=await t.api('POST','/api/v1/orders',{token:ct,body:{serviceId:svc.id,description:'طلب يبقى مفتوحًا حتى يدخل مقدم مناسب',contactPhone:c.creds.phone,location:{lat:13.9759,lng:44.1709},formData:{}}});
  assert.equal(order.status,201,JSON.stringify(order.body));
  // محاكاة أن الطلب أقدم بكثير؛ العمر لا يلغي أهليته.
  t.app.db.run(`UPDATE orders SET created_at=? WHERE id=?`, new Date(Date.now()-48*60*60*1000).toISOString(), order.body.order.id);
  await t.api('POST','/api/v1/provider/accepting-orders',{token:pt,body:{accepting:true}});
  const offers=await t.api('GET','/api/v1/provider/offers',{token:pt});
  assert.ok((offers.body.offers||[]).some((x:any)=>x.orderId===order.body.order.id), JSON.stringify(offers.body));
});

test('V82.8: المساعد يسأل فقط عن الغرض الناقص في طلب التوصيل', async () => {
  const c = await registerUser(t.api); const r = await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد شخص يوصل لي طلب إلى البيت'}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.recommended?.serviceSlug,'parcel-delivery');
  assert.equal(r.body.clarification?.question,'ما الطلب الذي تريد توصيله؟ اكتب اسم الغرض أو صفه بكلماتك.');
  assert.equal((r.body.clarification?.options||[]).length,0);
});

test('V82.8: طلب معروف لا يفتح سؤالًا زائدًا', async () => {
  const c = await registerUser(t.api); const r = await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد واحد يشتري لي بيبسي من البقالة ويوصله للبيت'}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.recommended?.serviceSlug,'purchase-and-delivery');
  assert.equal(r.body.clarification,null);
});

test('V82.8: واجهة العميل لا تعيد التمرير للأعلى وتعرض الشريط المتحرك', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync('public/app.ts', 'utf8');
  assert.equal(app.includes("window.scrollTo({top:0,behavior:'smooth'})"), false);
  assert.ok(app.includes('khadamat-news-ticker'));
  assert.ok(app.includes('قول طلبك بطريقتك ونحن نفهمه ونبحث لك عن مقدم خدمة'));
  assert.ok(app.includes('personal-recommendations-grid'));
});
