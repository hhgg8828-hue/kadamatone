import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser } from './helpers.js';

test('V66.16: عبارات المقاضي والشراء لا تُصنّف توصيل غرض عادي كشراء، وتفهم مقاضي البيت كتسوق', async()=>{
  const t=await startApp();
  try {
    const c=await registerUser(t.api);
    const parcel=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد توصيل غرض من عند أخوي إلى البيت'}});
    assert.equal(parcel.status,200,parcel.text);
    assert.equal(parcel.body.recommended?.serviceSlug,'parcel-delivery');

    const shopping=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد مقاضي للبيت'}});
    assert.equal(shopping.status,200,shopping.text);
    assert.equal(shopping.body.recommended?.serviceSlug,'shopping-for-me');

    const buy=await t.api('POST','/api/v1/assist/request',{token:c.body.accessToken,body:{text:'أريد واحد يشتري لي بيبسي ويوصله للبيت'}});
    assert.equal(buy.status,200,buy.text);
    assert.equal(buy.body.recommended?.serviceSlug,'purchase-and-delivery');
  } finally { await t.close(); }
});

test('V66.16: محادثة الطلب تبقى خاصة بالطرفين ولا يمكن لمقدم آخر قراءتها أو الكتابة فيها', async()=>{
  const t=await startApp();
  try {
    const c=await registerUser(t.api);
    const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود أول'}});
    const other=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'مزود آخر'}});
    const pid=t.app.db.get('SELECT id FROM service_providers WHERE user_id=?',p.body.user.id)!.id;
    const oid=t.app.db.get('SELECT id FROM service_providers WHERE user_id=?',other.body.user.id)!.id;
    const svc=t.app.db.get("SELECT id FROM services WHERE slug='cleaning'")!;
    for (const id of [pid,oid]) t.app.db.run("UPDATE service_providers SET verification_status='VERIFIED',is_online=1,accepting_orders=1,base_lat=15.36,base_lng=44.19 WHERE id=?",id);
    t.app.db.run('INSERT INTO provider_services(provider_id,service_id,experience_years,is_active) VALUES(?,?,?,1)',pid,svc.id,3);
    const order=await t.api('POST','/api/v1/orders',{token:c.body.accessToken,headers:{'Idempotency-Key':'v6616-order'},body:{serviceId:svc.id,description:'طلب محادثة خاصة',location:{lat:15.36,lng:44.19},contactPhone:c.creds.phone}});
    assert.equal(order.status,201,order.text);
    const offer=(await t.api('GET','/api/v1/provider/offers',{token:p.body.accessToken})).body.offers.find((x:any)=>x.orderId===order.body.order.id);
    assert.ok(offer);
    const accepted=await t.api('POST',`/api/v1/provider/offers/${offer.id}/accept`,{token:p.body.accessToken,body:{}});
    assert.equal(accepted.status,200,accepted.text);
    const sent=await t.api('POST',`/api/v1/orders/${order.body.order.id}/messages`,{token:c.body.accessToken,headers:{'Idempotency-Key':'v6616-msg'},body:{body:'أين أنت؟'}});
    assert.equal(sent.status,201,sent.text);
    const forbiddenRead=await t.api('GET',`/api/v1/orders/${order.body.order.id}/messages`,{token:other.body.accessToken});
    assert.equal(forbiddenRead.status,403,forbiddenRead.text);
    const forbiddenWrite=await t.api('POST',`/api/v1/orders/${order.body.order.id}/messages`,{token:other.body.accessToken,headers:{'Idempotency-Key':'v6616-other-msg'},body:{body:'رسالة غير مصرح بها'}});
    assert.equal(forbiddenWrite.status,403,forbiddenWrite.text);
  } finally { await t.close(); }
});
