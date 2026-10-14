import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';

const serviceBySlug=(t:any,slug:string)=>t.app.catalog.all().services.find((x:any)=>x.slug===slug)!;

test('V66.6: الخدمات الزراعية لا تظهر كخدمات مكسورة خارج الموسم وتعمل End-to-End بعد تفعيل الموسم', async()=>{
  const t=await startApp();
  try{
    const admin=await loginAdmin(t.api); const customer=await registerUser(t.api);
    for(const slug of ['seasonal-plowing','seasonal-harvest','seasonal-crop-transport']){
      const svc=serviceBySlug(t,slug);
      const hidden=await t.api('GET',`/api/v1/services/${svc.id}`,{token:customer.body.accessToken});
      assert.equal(hidden.status,404,slug);
      const now=t.app.clock.now();
      const patch=await t.api('PATCH',`/api/v1/admin/services/${svc.id}`,{token:admin,body:{seasonalEnabled:true,seasonStartAt:new Date(now-60000).toISOString(),seasonEndAt:new Date(now+3600000).toISOString()}});
      assert.equal(patch.status,200,patch.text);
      const opened=await t.api('GET',`/api/v1/services/${svc.id}`,{token:customer.body.accessToken});
      assert.equal(opened.status,200,opened.text);
      const order=await t.api('POST','/api/v1/orders',{token:customer.body.accessToken,headers:{'Idempotency-Key':`agri-${slug}`},body:{serviceId:svc.id,description:`طلب ${opened.body.service.name}`,location:{lat:13.9759,lng:44.1709,accuracy:50},contactPhone:customer.creds.phone}});
      assert.equal(order.status,201,order.text);
      const row=t.app.db.get<any>('SELECT service_id,status FROM orders WHERE id=?',order.body.order.id);
      assert.equal(row.service_id,svc.id); assert.ok(['PENDING','SEARCHING','ASSIGNED'].includes(row.status));
    }
  }finally{await t.close();}
});

test('V66.6: إضافة المركبة تحفظها فعليًا وتدعم منع التكرار', async()=>{
  const t=await startApp();
  try{
    const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'سائق اختبار'}});
    const key='vehicle-idem-1';
    const body={vehicleType:'MOTORCYCLE',make:'Honda',model:'CG',year:2022,color:'أسود',plateNumber:'12345'};
    const a=await t.api('POST','/api/v1/provider/vehicles',{token:p.body.accessToken,headers:{'Idempotency-Key':key},body});
    assert.equal(a.status,201,a.text);
    const b=await t.api('POST','/api/v1/provider/vehicles',{token:p.body.accessToken,headers:{'Idempotency-Key':key},body});
    assert.equal(b.status,200,b.text); assert.equal(b.body.idempotent,true);
    const list=await t.api('GET','/api/v1/provider/vehicles',{token:p.body.accessToken});
    assert.equal(list.status,200); assert.equal(list.body.vehicles.length,1); assert.equal(list.body.vehicles[0].plate_number,'12345');
    const dbCount=t.app.db.get<any>('SELECT COUNT(*) c FROM provider_vehicles WHERE provider_id=(SELECT id FROM service_providers WHERE user_id=?)',p.body.user.id)?.c;
    assert.equal(dbCount,1);
  }finally{await t.close();}
});

test('V66.6: الطلب المستعجل والمجدول يحفظان الأولوية والموعد ويمنعان الموعد الماضي', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api); const svc=serviceBySlug(t,'document-delivery');
    const scheduled=new Date(Date.now()+3600000).toISOString();
    const r=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'طلب مستند مستعجل ومجدول',location:{lat:13.9759,lng:44.1709},contactPhone:c.creds.phone,priority:'URGENT',scheduledAt:scheduled}});
    assert.equal(r.status,201,r.text); assert.equal(r.body.order.priority,'URGENT'); assert.equal(r.body.order.scheduledAt,scheduled);
    const past=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'موعد قديم',location:{lat:13.9759,lng:44.1709},contactPhone:c.creds.phone,scheduledAt:new Date(Date.now()-60000).toISOString()}});
    assert.equal(past.status,422); assert.equal(past.body.error.code,'SCHEDULED_TIME_PAST');
  }finally{await t.close();}
});

test('V66.6: رسائل المحادثة تمنع التكرار بنفس Idempotency-Key', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api); const svc=serviceBySlug(t,'document-delivery');
    const o=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,body:{serviceId:svc.id,description:'طلب للمحادثة',contactPhone:c.creds.phone}});
    const key='chat-idem-1'; const body={body:'رسالة واحدة'};
    const a=await t.api('POST',`/api/v1/orders/${o.body.order.id}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':key},body});
    const b=await t.api('POST',`/api/v1/orders/${o.body.order.id}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':key},body});
    assert.equal(a.status,201,a.text); assert.equal(b.status,200,b.text); assert.equal(b.body.idempotent,true);
    const count=t.app.db.get<any>('SELECT COUNT(*) c FROM order_messages WHERE order_id=?',o.body.order.id)?.c; assert.equal(count,1);
  }finally{await t.close();}
});

test('V66.6: اشتراك Push يحفظ الجهاز ومفتاح VAPID متاح للواجهة', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const vapid=await t.api('GET','/api/v1/notifications/vapid-public-key');
    assert.equal(vapid.status,200); assert.ok(typeof vapid.body.publicKey==='string' && vapid.body.publicKey.length>20);
    const endpoint='https://push.example.test/subscription-1';
    const sub=await t.api('POST','/api/v1/notifications/subscriptions',{token:c.body.accessToken,body:{endpoint,p256dh:'B'.repeat(87),auth:'A'.repeat(22),platform:'WEB'}});
    assert.equal(sub.status,200,sub.text);
    const status=await t.api('GET','/api/v1/notifications/subscriptions/status',{token:c.body.accessToken});
    assert.equal(status.body.webPush,true); assert.equal(status.body.count,1);
  }finally{await t.close();}
});

test('V66.6: أخطاء التسجيل ترجع تفاصيل الحقل الصحيح وكلمة المرور 8 أحرف على الأقل', async()=>{
  const t=await startApp();
  try{
    const r=await t.api('POST','/api/v1/auth/register',{body:{fullName:'مستخدم',phone:'+967770123456',password:'1234567',role:'CUSTOMER'}});
    assert.equal(r.status,422); assert.ok(r.body.error.details.some((d:any)=>d.path==='password'));
    const provider=await t.api('POST','/api/v1/auth/register',{body:{fullName:'مزود',phone:'+967770123457',password:'abcdefgh',role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود'}}});
    assert.equal(provider.status,422); assert.ok(provider.body.error.details.some((d:any)=>d.path==='email'));
  }finally{await t.close();}
});

test('V66.6: خادم Push يبني حمولة Web Push مشفرة ويوقّع VAPID', async()=>{
  const t=await startApp();
  const crypto=(await import('node:crypto')).default as any;
  const original=(globalThis as any).fetch;
  try{
    const c=await registerUser(t.api);
    const client=crypto.createECDH('prime256v1'); client.generateKeys();
    const endpoint='https://push.example.test/send/1';
    await t.api('POST','/api/v1/notifications/subscriptions',{token:c.body.accessToken,body:{endpoint,p256dh:client.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url'),platform:'WEB'}});
    let captured:any=null;
    (globalThis as any).fetch=async (_url:string,init:any)=>{captured=init;return {status:201,ok:true};};
    await t.app.webPush.send(c.body.user.id,{title:'اختبار Push',body:'رسالة اختبار',data:{orderId:'order-1'}});
    assert.ok(captured); assert.equal(captured.method,'POST'); assert.equal(captured.headers['Content-Encoding'],'aes128gcm'); assert.match(captured.headers.Authorization,/^vapid t=.+, k=.+/); assert.ok(captured.body instanceof Uint8Array); assert.ok(captured.body.length>100);
  }finally{(globalThis as any).fetch=original;await t.close();}
});
