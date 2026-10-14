import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';

const findService = (t:any, slug:string) => t.app.catalog.all().services.find((x:any)=>x.slug===slug)!;

test('V63: إنشاء الطلب بدون موقع مسموح ويحفظه بدون موقع وهمي للعميل', async () => {
  const t=await startApp();
  try {
    const c=await registerUser(t.api); const svc=findService(t,'document-delivery');
    const r=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v63-no-location-1'},body:{serviceId:svc.id,description:'أريد توصيل مستند بدون تحديد الموقع الآن',contactPhone:c.creds.phone}});
    assert.equal(r.status,201,r.text);
    assert.equal(r.body.order.location,null);
    const row=t.app.db.get<any>('SELECT location_provided,location_id FROM orders WHERE id=?',r.body.order.id);
    assert.equal(row.location_provided,0);
    assert.equal(row.location_id,'no-location');
  } finally { await t.close(); }
});

test('V63: إرسال الموقع داخل محادثة الطلب محفوظ ومتاح للطرف الآخر دون كشف أرقام الهاتف', async () => {
  const t=await startApp();
  try {
    const c=await registerUser(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود اختبار'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    const svc=findService(t,'document-delivery');
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?",13.9759,44.1709,pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,1);
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'توصيل مستند',location:{lat:13.9759,lng:44.1709},contactPhone:c.creds.phone}});
    assert.equal(order.status,201,order.text);
    const offers=await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken});
    if(offers.body.offers.length) await t.api('POST',`/api/v1/provider/offers/${offers.body.offers[0].id}/accept`,{token:p.body.accessToken,body:{}});
    const msg=await t.api('POST',`/api/v1/orders/${order.body.order.id}/messages`,{token:c.body.accessToken,body:{body:'هذا موقعي',location:{lat:13.9761,lng:44.1712,accuracy:25,addressText:'بجانب المدرسة'}}});
    assert.equal(msg.status,201,msg.text); assert.equal(msg.body.message.location.addressText,'بجانب المدرسة');
    const messages=await t.api('GET',`/api/v1/orders/${order.body.order.id}/messages`,{token:p.body.accessToken});
    assert.equal(messages.status,200); assert.equal(messages.body.messages[0].location.lat,13.9761);
    const providerOrder=await t.api('GET',`/api/v1/orders/${order.body.order.id}`,{token:p.body.accessToken});
    assert.equal(providerOrder.body.order.contactPhone,null);
    assert.equal(providerOrder.body.order.customer.phone,null);
  } finally { await t.close(); }
});

test('V63: الخدمة الموسمية لا تظهر خارج الموسم وتظهر داخله من خلال إعداد الإدارة', async () => {
  const t=await startApp();
  try {
    const admin=await loginAdmin(t.api); const svc=findService(t,'seasonal-harvest');
    const hidden=await t.api('GET',`/api/v1/services/${svc.id}`,{token:admin});
    assert.equal(hidden.status,404);
    const bootstrap=await t.api('GET','/api/v1/catalog/bootstrap',{token:admin});
    assert.equal(bootstrap.status,200,bootstrap.text);
    assert.equal((bootstrap.body.services||[]).some((x:any)=>x.id===svc.id),false);
    const now=t.app.clock.now();
    const start=new Date(now-60_000).toISOString(); const end=new Date(now+60_000).toISOString();
    const patch=await t.api('PATCH',`/api/v1/admin/services/${svc.id}`,{token:admin,body:{seasonalEnabled:true,seasonStartAt:start,seasonEndAt:end}});
    assert.equal(patch.status,200,patch.text);
    const visible=await t.api('GET',`/api/v1/services/${svc.id}`,{token:admin});
    assert.equal(visible.status,200,visible.text);
    assert.equal(visible.body.service.seasonalEnabled,true);
    const past=new Date(now-120_000).toISOString();
    const patchPast=await t.api('PATCH',`/api/v1/admin/services/${svc.id}`,{token:admin,body:{seasonalEnabled:true,seasonStartAt:new Date(now-180_000).toISOString(),seasonEndAt:past}});
    assert.equal(patchPast.status,200,patchPast.text);
    const hiddenAgain=await t.api('GET',`/api/v1/services/${svc.id}`,{token:admin});
    assert.equal(hiddenAgain.status,404);
  } finally { await t.close(); }
});

test('V63: بعد استنفاد موجات البحث يستمر النظام بإعادة البحث لاحقًا', async () => {
  const t=await startApp();
  try {
    const admin=await loginAdmin(t.api); const c=await registerUser(t.api); const svc=findService(t,'document-delivery');
    await t.api('PUT','/api/v1/admin/settings/assignment.max_waves',{token:admin,body:{value:1}});
    await t.api('PUT','/api/v1/admin/settings/assignment.search_retry_minutes',{token:admin,body:{value:1}});
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'طلب ينتظر مقدم خدمة',location:{lat:13.9759,lng:44.1709},contactPhone:c.creds.phone}});
    assert.equal(order.status,201,order.text);
    assert.equal(t.app.db.get<any>('SELECT search_exhausted_at FROM orders WHERE id=?',order.body.order.id).search_exhausted_at,null);
    const tick=t.app.assignment.tick(); assert.equal(tick.exhausted,1);
    assert.ok(t.app.db.get<any>('SELECT search_exhausted_at FROM orders WHERE id=?',order.body.order.id).search_exhausted_at);
    const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود وصل لاحقًا'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?",13.9759,44.1709,pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,1);
    const realNow=t.app.clock.now; t.app.clock.now=()=>realNow()+61_000;
    const tick2=t.app.assignment.tick(); assert.ok(tick2.waved>=1);
    const offers=await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken}); assert.equal(offers.status,200); assert.ok(offers.body.offers.length>=1);
  } finally { await t.close(); }
});

test('V63: اعتذار مقدم الخدمة بعد القبول يعيد الطلب للبحث عن بديل دون إنشاء طلب جديد', async () => {
  const t=await startApp();
  try {
    const c=await registerUser(t.api); const p1=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'المقدم الأول'}}); const p2=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'المقدم البديل'}});
    const svc=findService(t,'document-delivery');
    for (const p of [p1,p2]) { const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id; t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,base_lat=?,base_lng=? WHERE id=?",13.9759,44.1709,pid); t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,1); }
    await t.api('PUT','/api/v1/admin/settings/assignment.batch_size',{token:await loginAdmin(t.api),body:{value:1}});
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'طلب يحتاج مقدم بديل',location:{lat:13.9759,lng:44.1709},contactPhone:c.creds.phone}});
    const oId=order.body.order.id;
    const offers1=await t.api('GET','/api/v1/provider/offers',{token:p1.body.accessToken}); const offers2=await t.api('GET','/api/v1/provider/offers',{token:p2.body.accessToken});
    const first=offers1.body.offers.length?offers1.body.offers[0]:offers2.body.offers[0]; const firstToken=offers1.body.offers.length?p1.body.accessToken:p2.body.accessToken;
    await t.api('POST',`/api/v1/provider/offers/${first.id}/accept`,{token:firstToken,body:{}});
    const cancel=await t.api('POST',`/api/v1/orders/${oId}/cancel`,{token:firstToken,body:{reason:'لا أستطيع تنفيذ الطلب'}});
    assert.equal(cancel.status,200,cancel.text); assert.equal(cancel.body.order.id,oId); assert.equal(cancel.body.order.status,'ASSIGNED');
    const secondToken=firstToken===p1.body.accessToken?p2.body.accessToken:p1.body.accessToken;
    const offersAfter=await t.api('GET','/api/v1/provider/offers',{token:secondToken}); assert.ok(offersAfter.body.offers.some((x:any)=>x.orderId===oId));
  } finally { await t.close(); }
});
