import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';

test('V62: الموقع اليمني غير المصنف لا يرفض الطلب ويحفظ الإحداثيات', async () => {
  const t=await startApp();
  try {
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v62-unmapped-1'},body:{
      serviceId:t.app.catalog.all().services.find((x:any)=>x.slug==='document-delivery')!.id,
      description:'أريد توصيل مستند إلى نقطة ريفية غير مسماة',
      location:{lat:15.2,lng:44.8,source:'manual',addressText:'بعد الجسر باتجاه المزرعة، بجوار الشجرة الكبيرة'},
      contactPhone:c.creds.phone
    }});
    assert.equal(r.status,201,r.text);
    assert.equal(r.body.order.location.areaId,'system-yemen');
    assert.equal(r.body.order.location.addressText,'بعد الجسر باتجاه المزرعة، بجوار الشجرة الكبيرة');
  } finally { await t.close(); }
});

test('V62: التوصيات شخصية ولا تعتمد على طلبات العملاء الآخرين', async () => {
  const t=await startApp();
  try {
    const c1=await registerUser(t.api), c2=await registerUser(t.api);
    const svc=t.app.catalog.all().services.find((x:any)=>x.slug==='document-delivery')!;
    const common={serviceId:svc.id,description:'توصيل مستند شخصي',location:{lat:15.3694,lng:44.191,source:'map'},contactPhone:c1.creds.phone};
    const r=await t.api('POST','/api/v1/orders',{token:c1.body.accessToken,headers:{'Idempotency-Key':'v62-rec-1'},body:common}); assert.equal(r.status,201,r.text);
    const a=await t.api('GET','/api/v1/me/recommendations',{token:c1.body.accessToken});
    const b=await t.api('GET','/api/v1/me/recommendations',{token:c2.body.accessToken});
    assert.equal(a.status,200); assert.equal(b.status,200);
    assert.ok(a.body.recommendations.some((x:any)=>x.id===svc.id));
    assert.ok(!b.body.recommendations.some((x:any)=>x.id===svc.id));
    assert.equal(a.body.source,'customer-only');
  } finally { await t.close(); }
});

test('V62: إدارة مناطق الخدمة حقيقية وتؤثر في المطابقة', async () => {
  const t=await startApp();
  try {
    const admin=await loginAdmin(t.api);
    const svc=t.app.catalog.all().services.find((x:any)=>x.slug==='document-delivery')!;
    const areas=(await t.api('GET','/api/v1/admin/areas',{token:admin})).body.areas;
    const ibb=areas.find((x:any)=>x.id==='system-yemen'); assert.ok(ibb);
    const put=await t.api('PUT',`/api/v1/admin/services/${svc.id}/areas`,{token:admin,body:{areaIds:[ibb.id]}});
    assert.equal(put.status,200,put.text);
    const got=await t.api('GET',`/api/v1/admin/services/${svc.id}/areas`,{token:admin});
    assert.equal(got.status,200); assert.deepEqual(got.body.areas.map((x:any)=>x.id),[ibb.id]);
  } finally { await t.close(); }
});

test('V62: إثبات التسليم PIN يمر عبر العميل ثم مقدم الخدمة قبل الإكمال', async () => {
  const t=await startApp();
  try {
    const c=await registerUser(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'سائق اختبار',specialty:'توصيل'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    const svc=t.app.catalog.all().services.find((x:any)=>x.slug==='document-delivery')!;
    
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?",13.9759,44.1709,pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,2);
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v62-proof-1'},body:{serviceId:svc.id,description:'توصيل مستند مع رمز تسليم',location:{lat:13.9759,lng:44.1709,source:'map'},contactPhone:c.creds.phone}});
    assert.equal(order.status,201,order.text); const id=order.body.order.id;
    const offers=await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken}); assert.equal(offers.status,200,offers.text); assert.ok(offers.body.offers.length);
    const accepted=await t.api('POST',`/api/v1/provider/offers/${offers.body.offers[0].id}/accept`,{token:p.body.accessToken,body:{}}); assert.equal(accepted.status,200,accepted.text);
    await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'ON_THE_WAY'}});
    await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'IN_PROGRESS'}});
    const proof=await t.api('POST',`/api/v1/orders/${id}/delivery-proof/issue`,{token:c.body.accessToken,body:{}}); assert.equal(proof.status,200,proof.text); assert.match(proof.body.pin,/^\d{6}$/);
    const wrong=await t.api('POST',`/api/v1/provider/orders/${id}/delivery-proof/verify`,{token:p.body.accessToken,body:{pin:'000000'}}); assert.equal(wrong.status,422);
    const good=await t.api('POST',`/api/v1/provider/orders/${id}/delivery-proof/verify`,{token:p.body.accessToken,body:{pin:proof.body.pin}}); assert.equal(good.status,200,good.text);
    const done=await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'COMPLETED'}}); assert.equal(done.status,200,done.text);
  } finally { await t.close(); }
});
