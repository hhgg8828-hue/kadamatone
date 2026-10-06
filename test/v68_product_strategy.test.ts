import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { startApp, registerUser } from './helpers.js';

async function registerProvider(api:any){
  return registerUser(api,{role:'PROVIDER',fullName:'مقدم اختبار',phone:'+967770001199',email:'p68@example.com',password:'Demo12345',provider:{providerType:'DRIVER',displayName:'مقدم اختبار',bio:'',specialty:'نقل'}});
}

test('V68: الكتالوج يعرض الزراعة كعائلة أساسية ويضع السيارات تحت الصيانة', async()=>{
  const t=await startApp();
  try{
    const cat=t.app.db.get<any>(`SELECT id FROM categories WHERE slug='agriculture'`);
    assert.ok(cat);
    const r=await t.api('GET','/api/v1/categories/maintenance/services');
    assert.ok((r.body.services||[]).some((x:any)=>x.slug==='car-battery-service'));
    assert.ok(t.app.db.get(`SELECT id FROM services WHERE slug='farm-worker'`));
  } finally { await t.close(); }
});

test('V68: قاموس العبارات اليمنية يُستخدم فعليًا في المطابقة', async()=>{
  const t=await startApp();
  try{
    const svc=t.app.db.get<any>(`SELECT id FROM services WHERE slug='electricity'`);
    t.app.db.run(`INSERT OR IGNORE INTO service_aliases(id,service_id,phrase,normalized_phrase,source,created_at) VALUES(?,?,?,?,?,?)`,'alias68',svc.id,'كهربا البيت','كهربا البيت','ADMIN',new Date().toISOString());
    const r=await t.api('POST','/api/v1/search/intent',{body:{text:'أحتاج كهربا البيت'}});
    assert.equal(r.status,200,r.text);
    assert.equal(r.body.matches?.[0]?.serviceSlug,'electricity');
  } finally { await t.close(); }
});

test('V68: موقع الطلب يحفظ القرية والمعلم ووصف الوصول', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v68-location'},body:{serviceId:t.app.db.get<any>(`SELECT id FROM services WHERE slug='custom-request'`)!.id,description:'أحتاج خدمة خاصة في القرية',contactPhone:'+967770000010',location:{lat:13.97,lng:44.17,accuracy:20,source:'gps',localityText:'قرية الاختبار',landmarkText:'بجانب المدرسة',accessNotes:'بعد السوق ثم البيت الثاني'}}});
    assert.equal(r.status,201,r.text);
    assert.equal(r.body.order.location.localityText,'قرية الاختبار');
    assert.equal(r.body.order.location.landmarkText,'بجانب المدرسة');
    assert.equal(r.body.order.location.accessNotes,'بعد السوق ثم البيت الثاني');
  } finally { await t.close(); }
});

test('V68: الاتصال داخل الطلب لا يكشف الرقم إلا للطرف المرتبط', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const p=await registerProvider(t.api);
    const service=t.app.db.get<any>(`SELECT id FROM services WHERE slug='custom-request'`);
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v68-contact'},body:{serviceId:service.id,description:'خدمة اتصال اختبار',contactPhone:c.body.user.phone}});
    assert.equal(order.status,201,order.text);
    const oid=order.body.order.id;
    const providerId=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    t.app.db.run(`UPDATE orders SET provider_id=?,status='ACCEPTED' WHERE id=?`,providerId,oid);
    const cp=await t.api('GET',`/api/v1/orders/${oid}/contact`,{token:p.body.accessToken});
    assert.equal(cp.status,200,cp.text);
    assert.equal(cp.body.phone,c.body.user.phone);
  } finally { await t.close(); }
});

test('V68: إتمام الطلب ينشئ استحقاق عمولة قابل للتسوية', async()=>{
  const t=await startApp();
  try{
    const c=await registerUser(t.api);
    const p=await registerProvider(t.api);
    const providerId=t.app.db.get<any>('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id).id;
    const service=t.app.db.get<any>(`SELECT id FROM services WHERE slug='custom-request'`);
    const now=new Date().toISOString();
    const oid='order-v68-settlement';
    t.app.db.run(`INSERT INTO locations(id,lat,lng,accuracy_m,address_text,landmark_text,locality_text,access_notes,area_id,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,'loc-v68',13.97,44.17,10,null,null,'قرية',null,'system-yemen','gps',now);
    t.app.db.run(`INSERT INTO orders(id,code,customer_id,service_id,provider_id,status,priority,description,form_data,location_id,area_id,contact_phone,pricing_type,price_snapshot,agreed_price,currency,payment_method,attachments,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,oid,'KH-V68-SET',c.body.user.id,service.id,providerId,'IN_PROGRESS','NORMAL','اختبار تسوية','{}','loc-v68','system-yemen',c.body.user.phone,'QUOTE',null,10000,'YER','CASH','[]',now,now);
    t.app.db.run(`INSERT INTO order_status_history(order_id,to_status,actor_role,created_at) VALUES(?,?,?,?)`,oid,'IN_PROGRESS','SYSTEM',now);
    const fakeCtx:any={user:{id:p.body.user.id,role:'PROVIDER',providerId},app:t.app};
    const o=t.app.db.get<any>('SELECT * FROM orders WHERE id=?',oid);
    t.app.orders.applyTransition(o,'COMPLETED','PROVIDER',fakeCtx);
    const settlement=t.app.db.get<any>('SELECT * FROM provider_settlements WHERE order_id=?',oid);
    assert.ok(settlement);
    assert.equal(settlement.status,'DUE');
    assert.equal(Number(settlement.commission_amount),1000);
  } finally { await t.close(); }
});

test('V68: ملفات الواجهة تشير إلى إصدار الكاش الجديد وتعرض مفاتيح التجربة الريفية',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.ts','utf8');
  const sw=fs.readFileSync('public/sw.js','utf8');
  assert.ok(index.includes('app.js?v=77.0'));
  assert.ok(sw.includes('khadamat-shell-v77'));
  assert.ok(app.includes('أقرب معلم'));
  assert.ok(app.includes('customerMainCategories'));
});
