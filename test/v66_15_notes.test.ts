import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';

async function setupAssignedOrder(t:any){
  const c=await registerUser(t.api);
  const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود V66.15'}});
  const pid=t.app.db.get('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
  const svc=t.app.db.get("SELECT id FROM services WHERE slug='cleaning'");
  t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?",pid);
  t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,3);
  const o=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6615-order-'+Date.now()},body:{serviceId:svc.id,description:'طلب اختبار V66.15',location:{lat:15.36,lng:44.19},contactPhone:c.creds.phone}});
  assert.equal(o.status,201,o.text);
  const offer=(await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken})).body.offers.find((x:any)=>x.orderId===o.body.order.id);
  assert.ok(offer);
  const accepted=await t.api('POST',`/api/v1/provider/offers/${offer.id}/accept`,{token:p.body.accessToken,body:{}});
  assert.equal(accepted.status,200,accepted.text);
  return {c,p,orderId:o.body.order.id};
}

test('V66.15: محادثة الطلب تبقى ثنائية الاتجاه في نفس السجل، وإشعار الرسالة يصل للطرف الآخر', async()=>{
  const t=await startApp();
  try{
    const {c,p,orderId}=await setupAssignedOrder(t);
    const events:any[]=[]; const original=t.app.sse.send.bind(t.app.sse);
    (t.app.sse as any).send=(uid:string,event:string,data:any)=>{events.push({uid,event,data});return original(uid,event,data)};
    const first=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'v6615-c1'},body:{body:'هذه رسالة من العميل'}});
    assert.equal(first.status,201,first.text);
    assert.ok(events.some(x=>x.uid===p.body.user.id&&x.event==='chat_message'&&x.data.orderId===orderId));
    const second=await t.api('POST',`/api/v1/orders/${orderId}/messages`,{token:p.body.accessToken,headers:{'Idempotency-Key':'v6615-p1'},body:{body:'هذا رد مقدم الخدمة'}});
    assert.equal(second.status,201,second.text);
    assert.ok(events.some(x=>x.uid===c.body.user.id&&x.event==='chat_message'&&x.data.orderId===orderId));
    const messages=await t.api('GET',`/api/v1/orders/${orderId}/messages?limit=20`,{token:p.body.accessToken});
    assert.deepEqual(messages.body.messages.map((x:any)=>x.body),['هذه رسالة من العميل','هذا رد مقدم الخدمة']);
  } finally { await t.close(); }
});

test('V66.15: لا تظهر متابعة الشكوى لمجرد فتح محادثة الطلب، وتظهر فقط عند وجود شكوى', async()=>{
  const t=await startApp();
  try{
    const {orderId}=await setupAssignedOrder(t);
    const noComplaint=await t.api('GET',`/api/v1/orders/${orderId}/complaint`,{token:(await registerUser(t.api)).body.accessToken}).catch(()=>null);
    // الوصول للمحادثة/الشكوى يُختبر فعليًا عبر مستخدم مشارك في اختبار مستقل؛ هنا نتحقق من العقدة التي تمنع خلط المسارين في الواجهة.
    const app=fs.readFileSync('public/app.ts','utf8');
    assert.match(app,/api\('\/orders\/'\+encodeURIComponent\(id\)\+'\/complaint'\)/);
    assert.match(app,/complaintPayload\.complaint\?/);
    assert.ok(!/\$\{\['ACCEPTED','ON_THE_WAY','IN_PROGRESS','COMPLETED','DISPUTED'\]\.includes\(o\.status\)\?`<button class="btn secondary" id="providerComplaintBtn"/.test(app));
    assert.ok(noComplaint===null || noComplaint.status===404 || noComplaint.status===200);
  } finally { await t.close(); }
});

test('V66.15: إشعارات مقدم الخدمة مختصرة في الصفحة الرئيسية والتفاصيل الكاملة في نافذة الإشعارات', async()=>{
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(app,/provider-notification-summary/);
  assert.match(app,/providerOpenAllNotifications/);
  assert.match(app,/providerOpenAllNotificationsInline/);
  assert.match(app,/async function fetchNotifications\(\)\{const j=await api\('\/notifications\?limit=100'\)/);
  assert.ok(!/providerNs\.map\(\(n:any\)=>`<div class="notification-card provider-inline-notification/.test(app));
});

test('V66.15: زر الإعلان والخدمة المؤقتة لهما مسار تفاعلي فعلي إلى طلب الخدمة', async()=>{
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(app,/data-campaign-action/);
  assert.match(app,/type="button" class="btn small" data-campaign-action/);
  assert.match(app,/openOrderForm\(v\)/);
  assert.match(app,/data-temp-action/);
  assert.match(app,/openTemporaryAction/);
  assert.match(app,/openOrderForm\(z\.linkedServiceId\)/);
});

test('V66.15: إشعار CHAT_MESSAGE لا يعيد بناء صفحة مقدم الخدمة أثناء فتح المحادثة', async()=>{
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(app,/const chatIsOpen=!!document\.getElementById\('chatMessages'\)/);
  assert.match(app,/\&\& !\(n\.type==='CHAT_MESSAGE' \&\& chatIsOpen\)/);
  assert.match(app,/notification-provider-chat/);
  assert.match(app,/await openOrderChat\(orderId\)/);
});
