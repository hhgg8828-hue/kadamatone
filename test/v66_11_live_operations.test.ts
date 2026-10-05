import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';

test('V66.11: حالة مقدم الخدمة تفصل الاتصال عن استقبال الطلبات والمطابقة تعتمد المصدر الحقيقي', async()=>{
  const t=await startApp();
  try {
    const admin=await loginAdmin(t.api);
    const pr=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'TECHNICIAN',displayName:'مغسلة حقيقية',bio:'',specialty:'غسيل السيارات'}});
    assert.equal(pr.status,201,pr.text);
    const pl=await t.api('POST','/api/v1/auth/login',{body:{identifier:pr.creds.email,password:pr.creds.password}}); assert.equal(pl.status,200,pl.text);
    const me=await t.api('GET','/api/v1/auth/me',{token:pl.body.accessToken}); const providerId=me.body.provider.id;
    t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',base_lat=13.9759,base_lng=44.1709,accepting_orders=1 WHERE id=?",providerId);
    const svc=t.app.db.get<any>("SELECT id FROM services WHERE slug='mobile-car-wash'"); assert.ok(svc);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',providerId,svc.id,3);
    let on=await t.api('POST','/api/v1/provider/online',{token:pl.body.accessToken,body:{online:true}}); assert.equal(on.status,200,on.text);
    let hb=await t.api('POST','/api/v1/provider/presence-heartbeat',{token:pl.body.accessToken,body:{}}); assert.equal(hb.status,200,hb.text);
    let live=await t.api('GET','/api/v1/admin/operations/live',{token:admin}); assert.equal(live.status,200,live.text);
    let row=live.body.providers.find((x:any)=>x.id===providerId); assert.equal(row.online,true); assert.equal(row.acceptingOrders,true); assert.ok(row.lastHeartbeatAt); assert.equal(row.availability,'AVAILABLE');
    const off=await t.api('POST','/api/v1/provider/accepting-orders',{token:pl.body.accessToken,body:{accepting:false}}); assert.equal(off.status,200,off.text);
    live=await t.api('GET','/api/v1/admin/operations/live',{token:admin}); row=live.body.providers.find((x:any)=>x.id===providerId); assert.equal(row.online,true); assert.equal(row.acceptingOrders,false); assert.equal(row.availability,'UNAVAILABLE');
    const cust=await registerUser(t.api); const order=await t.api('POST','/api/v1/orders',{token:cust.body.accessToken,headers:{'Idempotency-Key':'v66-11-live-order'},body:{serviceId:svc.id,description:'غسيل سيارة كامل في الموقع',location:{lat:13.9759,lng:44.1709},contactPhone:cust.creds.phone,formData:{car_type:'sedan',wash_scope:'both'}}}); assert.equal(order.status,201,order.text);
    const assigned=t.app.db.get<any>('SELECT 1 ok FROM order_assignments WHERE order_id=? AND provider_id=?',order.body.order.id,providerId); assert.equal(assigned,undefined);
    const on2=await t.api('POST','/api/v1/provider/accepting-orders',{token:pl.body.accessToken,body:{accepting:true}}); assert.equal(on2.status,200,on2.text);
    const orderRow=t.app.db.get<any>('SELECT * FROM orders WHERE id=?',order.body.order.id);
    const candidates=t.app.matcher.findCandidates(orderRow,{excludeProviderIds:[],limit:10});
    assert.ok(candidates.some((x:any)=>x.providerId===providerId));
  } finally { await t.close(); }
});

test('V66.11: صفحات الواجهة تستخدم cache bust الجديد وتعرض حالة استقبال الطلبات منفصلة', async()=>{
  const fs=await import('node:fs');
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(app,/\/provider\/accepting-orders/); assert.match(app,/acceptingOrders/); assert.match(app,/providerPollTimer=window\.setInterval[\s\S]*?2000/);
  for(const f of ['public/index.html','public/provider.html','public/admin.html']) assert.match(fs.readFileSync(f,'utf8'),/app\.js\?v=66\.11/);
});
