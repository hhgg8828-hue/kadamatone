import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, registerUser, loginAdmin } from './helpers.js';

async function setupCompletedOrder(t:any) {
  const api=t.api; const admin=await loginAdmin(api);
  const area=await api('POST','/api/v1/admin/areas',{token:admin,body:{name:{ar:'منطقة تقييم'},type:'CITY',centerLat:12.79,centerLng:45.02,radiusKm:25}});
  assert.equal(area.status,201,area.text); const areaId=area.body.area.id;
  const cats=(await api('GET','/api/v1/categories')).body.categories;
  const service=cats.flatMap((x:any)=>x.services||[]).find((x:any)=>x.slug==='air-conditioning'); assert.ok(service);
  const provider=await registerUser(api,{role:'PROVIDER',provider:{providerType:'TECHNICIAN',displayName:'فني تقييم'}});
  const providerToken=provider.body.accessToken; const me=await api('GET','/api/v1/auth/me',{token:providerToken}); const providerId=me.body.provider.id;
  t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',verified_at=?,base_lat=?,base_lng=? WHERE id=?",new Date().toISOString(),12.79,45.02,providerId);
  assert.equal((await api('PUT','/api/v1/provider/services',{token:providerToken,body:{services:[{serviceId:service.id,experienceYears:2}]}})).status,200);
  assert.equal((await api('PUT','/api/v1/provider/areas',{token:providerToken,body:{areaIds:[areaId]}})).status,200);
  assert.equal((await api('POST','/api/v1/provider/online',{token:providerToken,body:{online:true}})).status,200);
  const customer=await registerUser(api); const customerToken=customer.body.accessToken;
  const created=await api('POST','/api/v1/orders',{token:customerToken,body:{serviceId:service.id,description:'المكيف لا يعمل وأحتاج فحصًا',contactPhone:'+967771234567',location:{lat:12.79,lng:45.02,source:'gps'}}});
  assert.equal(created.status,201,created.text); const order=created.body.order;
  const offers=(await api('GET','/api/v1/provider/offers',{token:providerToken})).body.offers; assert.ok(offers.some((x:any)=>x.orderId===order.id));
  assert.equal((await api('POST',`/api/v1/provider/offers/${offers.find((x:any)=>x.orderId===order.id).id}/accept`,{token:providerToken})).status,200);
  assert.equal((await api('POST',`/api/v1/provider/orders/${order.id}/status`,{token:providerToken,body:{to:'ON_THE_WAY'}})).status,200);
  assert.equal((await api('POST',`/api/v1/provider/orders/${order.id}/status`,{token:providerToken,body:{to:'IN_PROGRESS'}})).status,200);
  assert.equal((await api('POST',`/api/v1/provider/orders/${order.id}/status`,{token:providerToken,body:{to:'COMPLETED'}})).status,200);
  return {api,admin,providerToken,customerToken,providerId,order};
}

test('V85.0: negative rating requires reason and stores provider/service feedback separately with real follow-up',async()=>{
 const t=await startApp();
 try{
  const x=await setupCompletedOrder(t);
  const missing=await x.api('POST',`/api/v1/orders/${x.order.id}/rating`,{token:x.customerToken,body:{score:2,comment:'تأخر الفني'}});
  assert.equal(missing.status,422); assert.equal(missing.body.error.code,'RATING_REASON_REQUIRED');
  const rated=await x.api('POST',`/api/v1/orders/${x.order.id}/rating`,{token:x.customerToken,body:{score:2,comment:'تأخر الفني',reasons:['DELAY'],serviceFeedback:{sentiment:'DISLIKE',reasons:['QUALITY'],comment:'الخدمة تحتاج تحسين'}}});
  assert.equal(rated.status,201,rated.text); assert.deepEqual(rated.body.rating.reasons,['DELAY']); assert.equal(rated.body.rating.serviceFeedback.sentiment,'DISLIKE');
  const stored=t.app.db.get<any>('SELECT * FROM rating_details WHERE order_id=?',x.order.id); assert.equal(stored.followup_status,'NEW'); assert.deepEqual(JSON.parse(stored.reasons_json),['DELAY']);
  const item=t.app.db.get<any>('SELECT * FROM order_service_ratings WHERE order_id=?',x.order.id); assert.equal(item.sentiment,'DISLIKE'); assert.deepEqual(JSON.parse(item.reasons_json),['QUALITY']);
  const notifications=(await x.api('GET','/api/v1/notifications',{token:x.customerToken})).body.notifications;
  const reply=notifications.find((n:any)=>n.type==='RATING_FEEDBACK_RESPONSE'); assert.ok(reply); assert.match(reply.body,/التأخير/); assert.equal(reply.data.orderId,x.order.id);
  const adminList=await x.api('GET','/api/v1/admin/ratings',{token:x.admin}); assert.equal(adminList.status,200,adminList.text); assert.equal(adminList.body.counts.new,1); assert.equal(adminList.body.items[0].orderId,x.order.id);
  const stranger=await registerUser(x.api); assert.equal((await x.api('GET','/api/v1/admin/ratings',{token:stranger.body.accessToken})).status,403);
  const update=await x.api('PATCH',`/api/v1/admin/ratings/${rated.body.rating.id}/followup`,{token:x.admin,body:{status:'IN_REVIEW',note:'تمت إحالة الملاحظة للفريق المختص'}}); assert.equal(update.status,200,update.text);
  assert.equal(t.app.db.get<any>('SELECT followup_status FROM rating_details WHERE order_id=?',x.order.id).followup_status,'IN_REVIEW');
  const again=await x.api('POST',`/api/v1/orders/${x.order.id}/rating`,{token:x.customerToken,body:{score:5}}); assert.equal(again.status,409);
 } finally { await t.close(); }
});

test('V85.0: new orders enter admin contact-confirmation queue and each outcome is audited',async()=>{
 const t=await startApp();
 try{
  const x=await setupCompletedOrder(t);
  const queue=await x.api('GET','/api/v1/admin/order-confirmations?status=ALL',{token:x.admin});
  assert.equal(queue.status,200,queue.text); const row=queue.body.items.find((v:any)=>v.orderId===x.order.id); assert.ok(row); assert.equal(row.status,'PENDING'); assert.equal(row.phone,'+967771234567');
  assert.equal((await x.api('GET','/api/v1/admin/order-confirmations',{token:x.providerToken})).status,403);
  const result=await x.api('PATCH',`/api/v1/admin/order-confirmations/${x.order.id}`,{token:x.admin,body:{status:'CONFIRMED',note:'تم الاتصال وأكد العميل الطلب'}});
  assert.equal(result.status,200,result.text); assert.equal(result.body.status,'CONFIRMED'); assert.equal(result.body.attemptCount,1);
  const saved=t.app.db.get<any>('SELECT * FROM order_contact_confirmations WHERE order_id=?',x.order.id); assert.equal(saved.status,'CONFIRMED'); assert.ok(saved.confirmed_at); assert.equal(saved.result_note,'تم الاتصال وأكد العميل الطلب');
  const notifications=(await x.api('GET','/api/v1/notifications',{token:x.customerToken})).body.notifications; assert.ok(notifications.some((n:any)=>n.type==='ORDER_CONFIRMATION_RESULT'&&n.data.orderId===x.order.id));
  const again=await x.api('PATCH',`/api/v1/admin/order-confirmations/${x.order.id}`,{token:x.admin,body:{status:'UNREACHABLE',note:'لم يرد'}}); assert.equal(again.status,200,again.text); assert.equal(again.body.attemptCount,2);
 } finally { await t.close(); }
});

test('V85.0: city-specific campaign image and catalog scope are filtered by selected city',async()=>{
 const t=await startApp();
 try{
  const admin=await loginAdmin(t.api); const now=Date.now();
  const makeArea=async(name:string,lat:number,lng:number)=>{const r=await t.api('POST','/api/v1/admin/areas',{token:admin,body:{name:{ar:name},type:'CITY',centerLat:lat,centerLng:lng,radiusKm:25}});assert.equal(r.status,201,r.text);return r.body.area.id};
  const cityA=await makeArea('مدينة الحملة أ',12.79,45.02); const cityB=await makeArea('مدينة الحملة ب',15.35,44.20);
  const categories=(await t.api('GET','/api/v1/categories')).body.categories; const svc=categories.flatMap((x:any)=>x.services||[]).find((x:any)=>x.slug==='air-conditioning');assert.ok(svc);
  const rules=await t.api('PUT',`/api/v1/admin/services/${svc.id}/areas`,{token:admin,body:{areaIds:[cityA]}});assert.equal(rules.status,200,rules.text);
  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]).toString('base64');
  const image=await t.api('POST','/api/v1/files',{token:admin,body:{purpose:'service_icon',name:'campaign.png',dataBase64:png}});assert.equal(image.status,201,image.text);
  const campaign=await t.api('POST','/api/v1/admin/campaigns',{token:admin,body:{title:{ar:'عرض المدينة أ'},description:{ar:'عرض مخصص للمدينة أ'},buttonLabel:{ar:'عرض التفاصيل'},imageFileId:image.body.file.id,actionType:'NONE',startAt:new Date(now-60000).toISOString(),endAt:new Date(now+86400000).toISOString(),areaIds:[cityA],isActive:true}});assert.equal(campaign.status,200,campaign.text);
  const a=await t.api('GET',`/api/v1/catalog/bootstrap?areaId=${cityA}`);assert.equal(a.status,200,a.text);assert.ok(a.body.campaigns.some((x:any)=>x.id===campaign.body.id&&x.imageUrl));assert.ok(a.body.services.some((x:any)=>x.id===svc.id));
  const b=await t.api('GET',`/api/v1/catalog/bootstrap?areaId=${cityB}`);assert.equal(b.status,200,b.text);assert.ok(!b.body.campaigns.some((x:any)=>x.id===campaign.body.id));assert.ok(!b.body.services.some((x:any)=>x.id===svc.id));
  const customer=await registerUser(t.api);const outOfArea=await t.api('POST','/api/v1/orders',{token:customer.body.accessToken,body:{serviceId:svc.id,description:'أحتاج صيانة للمكيف في مدينة أخرى',contactPhone:'+967771234567',areaId:cityB,location:{lat:15.35,lng:44.20,source:'gps'}}});assert.equal(outOfArea.status,422,outOfArea.text);assert.equal(outOfArea.body.error.code,'SERVICE_NOT_AVAILABLE_IN_AREA');
  const mismatchedCity=await t.api('POST','/api/v1/orders',{token:customer.body.accessToken,body:{serviceId:svc.id,description:'موقع الخدمة خارج المدينة المختارة',contactPhone:'+967771234567',areaId:cityA,location:{lat:15.35,lng:44.20,source:'gps'}}});assert.equal(mismatchedCity.status,422,mismatchedCity.text);assert.equal(mismatchedCity.body.error.code,'LOCATION_OUTSIDE_SELECTED_CITY');
  const bad=await t.api('PATCH',`/api/v1/admin/campaigns/${campaign.body.id}`,{token:admin,body:{areaIds:['unknown-area']}});assert.equal(bad.status,422);
 }finally{await t.close()}
});
