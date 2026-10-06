import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, registerUser, loginAdmin } from './helpers.js';

async function setupOrder(t:any){
  const c=await registerUser(t.api);
  const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود V66.14'}});
  const pid=(t.app.db.get as any)('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
  const svc=(t.app.db.get as any)("SELECT id FROM services WHERE slug='cleaning'");
  const now=new Date().toISOString();
  t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?",pid);
  t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,3);
  const o=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6614-order-'+Date.now()},body:{serviceId:svc.id,description:'اختبار مراسلة',location:{lat:15.36,lng:44.19},contactPhone:c.creds.phone}});
  assert.equal(o.status,201,o.text);
  const offer=(await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken})).body.offers.find((x:any)=>x.orderId===o.body.order.id);
  assert.ok(offer);
  const accepted=await t.api('POST',`/api/v1/provider/offers/${offer.id}/accept`,{token:p.body.accessToken,body:{}});
  assert.equal(accepted.status,200,accepted.text);
  return {c,p,pid,orderId:o.body.order.id};
}

test('V66.14: القدرات تحفظ الاختيارات فقط وتبقى قابلة لإعادة القراءة', async()=>{
  const t=await startApp();
  try{
    const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'قدرات'}});
    const a=await t.api('PUT','/api/v1/provider/capabilities',{token:p.body.accessToken,body:{capabilities:['trip:passenger','trip:medicine']}});
    assert.equal(a.status,200,a.text);
    const b=await t.api('GET','/api/v1/provider/capabilities',{token:p.body.accessToken});
    assert.deepEqual(b.body.capabilities.map((x:any)=>x.capabilityKey),['trip:medicine','trip:passenger']);
    const c=await t.api('PUT','/api/v1/provider/capabilities',{token:p.body.accessToken,body:{capabilities:['trip:purchase']}});
    assert.equal(c.status,200,c.text);
    const d=await t.api('GET','/api/v1/provider/capabilities',{token:p.body.accessToken});
    assert.deepEqual(d.body.capabilities.map((x:any)=>x.capabilityKey),['trip:purchase']);
  } finally { await t.close(); }
});

test('V66.14: اعتماد المركبة يعمل عبر endpoint الواجهة الصحيح /verification', async()=>{
  const t=await startApp();
  try{
    const admin=await loginAdmin(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مركبة'}});
    const v=await t.api('POST','/api/v1/provider/vehicles',{token:p.body.accessToken,body:{vehicleType:'MOTORCYCLE',make:'Honda',model:'CG',year:2020,color:'أسود',plateNumber:'V6614'}});
    assert.equal(v.status,201,v.text);
    const r=await t.api('PATCH',`/api/v1/admin/vehicles/${v.body.vehicle.id}/verification`,{token:admin,body:{status:'VERIFIED'}});
    assert.equal(r.status,200,r.text); assert.equal(r.body.vehicle.status,'VERIFIED');
  } finally { await t.close(); }
});

test('V66.14: محادثة الطلب ثنائية الاتجاه، والموقع يمر بالـ validation الصحيح، وإعادة نفس المفتاح لا تكرر الرسالة', async()=>{
  const t=await startApp();
  try{
    const {c,p,orderId}=await setupOrder(t);
    const a=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'msg-a'},body:{body:'أين أنت؟'}});
    assert.equal(a.status,201,a.text);
    const dup=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'msg-a'},body:{body:'أين أنت؟'}});
    assert.equal(dup.status,200,dup.text); assert.equal(dup.body.idempotent,true);
    const b=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:p.body.accessToken,headers:{'Idempotency-Key':'msg-b'},body:{body:'أنا قريب'}});
    assert.equal(b.status,201,b.text);
    const loc=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'msg-loc'},body:{body:'📍 الموقع المرسل',location:{lat:15.3601,lng:44.1902,accuracy:18}}});
    assert.equal(loc.status,201,loc.text); assert.equal(loc.body.message.location.lat,15.3601);
    const msgs=await t.api('GET',`/api/v1/orders/${orderId}/messages?limit=20`,{token:p.body.accessToken});
    assert.equal(msgs.status,200,msgs.text); assert.deepEqual(msgs.body.messages.map((x:any)=>x.body),['أين أنت؟','أنا قريب','📍 الموقع المرسل']);
  } finally { await t.close(); }
});

test('V66.14: ترتيب الرسائل يبقى صحيحًا حتى عندما يعيد الخادم نفس millisecond', async()=>{
  const t=await startApp();
  try{
    (t.app as any).clock={now:()=>1700000000000};
    const {c,orderId}=await setupOrder(t);
    for(let i=1;i<=5;i++){
      const r=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'rapid-'+i},body:{body:'رسالة '+i}});
      assert.equal(r.status,201,r.text);
    }
    const msgs=await t.api('GET',`/api/v1/orders/${orderId}/messages?limit=20`,{token:c.body.accessToken});
    assert.deepEqual(msgs.body.messages.map((x:any)=>x.body),['رسالة 1','رسالة 2','رسالة 3','رسالة 4','رسالة 5']);
    const times=msgs.body.messages.map((x:any)=>Date.parse(x.createdAt));
    assert.ok(times.every((v:number,i:number)=>i===0||v>times[i-1]));
  } finally { await t.close(); }
});

test('V66.14: رد الإدارة على الشكوى يرسل realtime للإدارة والعميل، مع idempotency للرد', async()=>{
  const t=await startApp();
  try{
    const {c,p,orderId}=await setupOrder(t);
    const complaint=await t.api('POST',`/api/v1/orders/${orderId}/complaints`,{token:c.body.accessToken,body:{category:'QUALITY',description:'الخدمة متأخرة وسيئة'}});
    assert.equal(complaint.status,201,complaint.text);
    const admin=await loginAdmin(t.api); const events:any[]=[]; const original=t.app.sse.send.bind(t.app.sse); (t.app.sse as any).send=(uid:string,event:string,data:any)=>{events.push({uid,event,data});return original(uid,event,data)};
    const r=await t.api('POST',`/api/v1/complaints/${complaint.body.complaint.id}/reply`,{token:admin,headers:{'Idempotency-Key':'admin-reply-1'},body:{body:'مرحبًا، هل هناك سبب للتأخير؟'}});
    assert.equal(r.status,200,r.text);
    const dup=await t.api('POST',`/api/v1/complaints/${complaint.body.complaint.id}/reply`,{token:admin,headers:{'Idempotency-Key':'admin-reply-1'},body:{body:'مرحبًا، هل هناك سبب للتأخير؟'}});
    assert.equal(dup.status,200); assert.equal(dup.body.idempotent,true);
    const customerEvents:any[]=events.filter(x=>x.event==='complaint_message'&&x.data.complaintId===complaint.body.complaint.id);
    assert.ok(customerEvents.some(x=>x.uid===c.body.user.id));
    const adminEvents:any[]=[]; (t.app.sse as any).send=(uid:string,event:string,data:any)=>{adminEvents.push({uid,event,data});return original(uid,event,data)};
    const customerReply=await t.api('POST',`/api/v1/complaints/${complaint.body.complaint.id}/reply`,{token:c.body.accessToken,headers:{'Idempotency-Key':'customer-reply-1'},body:{body:'لا يوجد سبب واضح، والخدمة تأخرت.'}});
    assert.equal(customerReply.status,200,customerReply.text);
    assert.ok(adminEvents.some(x=>x.event==='complaint_message'&&x.data.complaintId===complaint.body.complaint.id));
  } finally { await t.close(); }
});

test('V66.14: العميل يرى الطلبات الملغاة أيضًا، والواجهة تحتوي على dropdown للقدرات ومسار اعتماد المركبة والمحادثات الحية', async()=>{
  const app=fs.readFileSync('public/app.ts','utf8'); const html=fs.readFileSync('public/provider.html','utf8'); const index=fs.readFileSync('public/index.html','utf8'); const admin=fs.readFileSync('public/admin.html','utf8'); const sw=fs.readFileSync('public/sw.js','utf8');
  assert.match(app,/fetchAllCustomerOrders/); assert.match(app,/capability-dropdown/); assert.match(app,/data-capability/); assert.match(app,/\/verification/); assert.match(app,/khadamat:chat-message/); assert.match(app,/MESSAGE_OUTBOX/); assert.match(app,/data-campaign-action/); assert.match(app,/data-temp-id/); assert.match(app,/providerAvatarFile/); assert.match(app,/quick-services-strip/); assert.match(app,/complaint_message/);
  assert.ok(html.includes('app.js?v=77.0')); assert.ok(index.includes('app.js?v=77.0')); assert.ok(admin.includes('app.js?v=77.0')); assert.ok(sw.includes('khadamat-shell-v77'));
});
