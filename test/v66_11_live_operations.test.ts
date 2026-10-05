import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';

test('V66.11: حالات مقدم الخدمة مستقلة وHeartbeat يحدّث المصدر الحقيقي', async()=>{
  const t=await startApp();
  try{
    const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مقدم حي'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=0,base_lat=15.36,base_lng=44.19 WHERE id=?",pid);
    const prof=await t.api('GET','/api/v1/provider/profile',{token:p.body.accessToken});
    assert.equal(prof.status,200); assert.equal(prof.body.provider.isOnline,true); assert.equal(prof.body.provider.acceptingOrders,false);
    const on=await t.api('POST','/api/v1/provider/accepting-orders',{token:p.body.accessToken,body:{accepting:true}}); assert.equal(on.status,200,on.text); assert.equal(on.body.acceptingOrders,true);
    const hb=await t.api('POST','/api/v1/provider/presence-heartbeat',{token:p.body.accessToken,body:{}}); assert.equal(hb.status,200); assert.ok(hb.body.lastHeartbeatAt);
  } finally { await t.close(); }
});

test('V66.11: المطابقة لا ترسل طلبًا لمن أوقف استقبال الطلبات', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'لا يستقبل'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    const svc=t.app.db.get<any>("SELECT id FROM services WHERE slug='cleaning'");
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=0,base_lat=15.36,base_lng=44.19 WHERE id=?",pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,2);
    const o=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6611-no-accept'},body:{serviceId:svc.id,description:'أحتاج تنظيف المنزل بالكامل',location:{lat:15.36,lng:44.19},contactPhone:c.creds.phone}});
    assert.equal(o.status,201,o.text); const offers=await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken}); assert.equal(offers.body.offers.some((x:any)=>x.orderId===o.body.order.id),false);
  } finally { await t.close(); }
});

test('V66.11: المشوار يسمح بالإرسال بدون وجهة ثم إضافة الوجهة لاحقًا', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api); const o=await t.api('POST','/api/v1/trips',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6611-trip-no-dest'},body:{origin:{lat:15.36,lng:44.19},purpose:'PASSENGER',description:'أريد مشوارًا شخصيًا',contactPhone:c.creds.phone}});
    assert.equal(o.status,201,o.text); assert.equal(o.body.trip.destinationPending,true); assert.equal(o.body.trip.destination,null);
    const d=await t.api('POST',`/api/v1/trips/${o.body.order.id}/destination`,{token:c.body.accessToken,body:{destination:{lat:15.37,lng:44.20}}});
    assert.equal(d.status,200,d.text); assert.equal(d.body.trip.destinationPending,false); assert.ok(d.body.distanceKm>0); assert.ok(d.body.fare>0);
  } finally { await t.close(); }
});

test('V66.11: لوحة المراقبة الحية تعيد جميع مقدمي الخدمة مع heartbeat/location/order', async()=>{
  const t=await startApp();
  try{
    const admin=await t.api('POST','/api/v1/auth/login',{body:{identifier:'admin@test.local',password:'AdminPass123'}}); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مراقبة'}}); const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,last_seen_at=?,last_heartbeat_at=?,last_location_at=? WHERE id=?",new Date().toISOString(),new Date().toISOString(),new Date().toISOString(),pid);
    const live=await t.api('GET','/api/v1/admin/operations/live',{token:admin.body.accessToken}); assert.equal(live.status,200,live.text); const row=live.body.providers.find((x:any)=>x.id===pid); assert.ok(row); assert.equal(row.isOnline,true); assert.equal(row.acceptingOrders,true); assert.ok('lastHeartbeatAt' in row); assert.ok('lastLocationAt' in row); assert.ok('currentOrder' in row);
  } finally { await t.close(); }
});

test('V66.11: إكمال مشوار يحسب المسافة الفعلية من سجل المواقع ويحدّث الأجرة النهائية', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'سائق مشوار'}});
    const pid=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    const svc=t.app.catalog.all().services.find((x:any)=>x.slug==='motorcycle-trips'); assert.ok(svc); const serviceId=String((svc as any).id);
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?",pid);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,serviceId,2);
    const now=new Date().toISOString(); t.app.db.run("INSERT INTO provider_vehicles(id,provider_id,vehicle_type,status,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",'veh-v6611',pid,'MOTORCYCLE','VERIFIED',1,now,now);
    const o=await t.api('POST','/api/v1/trips',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6611-final-distance'},body:{origin:{lat:15.3600,lng:44.1900},destination:{lat:15.3700,lng:44.2000},purpose:'PASSENGER',description:'مشوار لاختبار المسافة الفعلية',contactPhone:c.creds.phone}});
    assert.equal(o.status,201,o.text); const id=o.body.order.id; const offer=(await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken})).body.offers[0]; await t.api('POST',`/api/v1/provider/offers/${offer.id}/accept`,{token:p.body.accessToken,body:{}});
    t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)',id,pid,15.3600,44.1900,new Date(Date.now()-2000).toISOString());
    t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)',id,pid,15.3650,44.1950,new Date(Date.now()-1000).toISOString());
    t.app.db.run('INSERT INTO trip_location_history(order_id,provider_id,lat,lng,created_at) VALUES(?,?,?,?,?)',id,pid,15.3700,44.2000,new Date().toISOString());
    await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'ON_THE_WAY'}}); await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'IN_PROGRESS'}});
    const proof=await t.api('POST',`/api/v1/orders/${id}/delivery-proof/issue`,{token:c.body.accessToken,body:{}}); assert.equal(proof.status,200,proof.text); const verified=await t.api('POST',`/api/v1/provider/orders/${id}/delivery-proof/verify`,{token:p.body.accessToken,body:{pin:proof.body.pin}}); assert.equal(verified.status,200,verified.text);
    const done=await t.api('POST',`/api/v1/provider/orders/${id}/status`,{token:p.body.accessToken,body:{to:'COMPLETED'}}); assert.equal(done.status,200,done.text);
    const trip=t.app.db.get<any>('SELECT distance_km distanceKm,fare FROM trip_orders WHERE order_id=?',id); assert.ok(trip.distanceKm>0); assert.equal(done.body.order.agreedPrice,trip.fare);
  } finally { await t.close(); }
});
