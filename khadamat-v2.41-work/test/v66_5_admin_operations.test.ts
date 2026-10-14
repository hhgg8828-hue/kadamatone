import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, loginAdmin, registerUser } from './helpers.js';

test('V66.5: مركز التشغيل والمراقبة الحية والتقارير وصحة النظام تعمل ببيانات حقيقية', async () => {
  const t = await startApp();
  try {
    const admin = await loginAdmin(t.api);
    const overview = await t.api('GET','/api/v1/admin/operations/overview',{token:admin});
    assert.equal(overview.status,200);
    assert.ok(['GOOD','ATTENTION','PROBLEM'].includes(overview.body.health));
    assert.equal(typeof overview.body.orders.unaccepted,'number');
    assert.equal(typeof overview.body.providers.online,'number');

    const live = await t.api('GET','/api/v1/admin/operations/live',{token:admin});
    assert.equal(live.status,200);
    assert.ok(Array.isArray(live.body.orders));
    assert.ok(Array.isArray(live.body.providers));

    const reports = await t.api('GET','/api/v1/admin/operations/reports',{token:admin});
    assert.equal(reports.status,200);
    assert.equal(typeof reports.body.summary.orders,'number');
    assert.ok(Array.isArray(reports.body.byService));

    const health = await t.api('GET','/api/v1/admin/system-health',{token:admin});
    assert.equal(health.status,200);
    assert.equal(health.body.db.ok,true);
  } finally { await t.close(); }
});

test('V66.5: الخدمات المؤقتة والحملات تحفظ الفترات وتختفي تلقائيًا من الكتالوج بعد الانتهاء', async () => {
  const t = await startApp();
  try {
    const admin = await loginAdmin(t.api);
    const catalog = await t.api('GET','/api/v1/admin/catalog',{token:admin});
    const service = catalog.body.categories.flatMap((c:any)=>c.services||[])[0];
    assert.ok(service?.id);
    const now = Date.now();
    const temp = await t.api('POST','/api/v1/admin/temporary-services',{token:admin,body:{
      linkedServiceId:service.id,name:{ar:'موسم اختبار'},title:{ar:'خدمة مؤقتة للاختبار'},description:{ar:'اختبار'},
      startAt:new Date(now-60000).toISOString(),endAt:new Date(now+3600000).toISOString(),isActive:true,maxOrders:10
    }});
    assert.equal(temp.status,200);
    const campaign = await t.api('POST','/api/v1/admin/campaigns',{token:admin,body:{
      title:{ar:'حملة اختبار'},description:{ar:'وصف'},buttonLabel:{ar:'اطلب الآن'},actionType:'SERVICE',actionValue:service.id,
      startAt:new Date(now-60000).toISOString(),endAt:new Date(now+3600000).toISOString(),isActive:true
    }});
    assert.equal(campaign.status,200);
    const publicCatalog = await t.api('GET','/api/v1/catalog/bootstrap');
    assert.equal(publicCatalog.status,200);
    assert.ok(publicCatalog.body.temporaryServices.some((x:any)=>x.id===temp.body.id));
    assert.ok(publicCatalog.body.campaigns.some((x:any)=>x.id===campaign.body.id));

    await t.api('PATCH',`/api/v1/admin/temporary-services/${temp.body.id}`,{token:admin,body:{endAt:new Date(now-1000).toISOString()}}).then(r=>assert.equal(r.status,200));
    await t.api('PATCH',`/api/v1/admin/campaigns/${campaign.body.id}`,{token:admin,body:{endAt:new Date(now-1000).toISOString()}}).then(r=>assert.equal(r.status,200));
    const after = await t.api('GET','/api/v1/catalog/bootstrap');
    assert.equal(after.body.temporaryServices.some((x:any)=>x.id===temp.body.id),false);
    assert.equal(after.body.campaigns.some((x:any)=>x.id===campaign.body.id),false);
    const history = await t.api('GET','/api/v1/admin/temporary-services',{token:admin});
    assert.ok(history.body.items.some((x:any)=>x.id===temp.body.id));
  } finally { await t.close(); }
});

test('V66.5: التنبيهات التشغيلية وسجلها محميان من العميل', async () => {
  const t = await startApp();
  try {
    const admin = await loginAdmin(t.api);
    const customer = await registerUser(t.api);
    const forbidden = await t.api('GET','/api/v1/admin/operations/overview',{token:customer.body.accessToken});
    assert.equal(forbidden.status,403);
    const alerts = await t.api('GET','/api/v1/admin/operations/alerts?status=OPEN',{token:admin});
    assert.equal(alerts.status,200);
    assert.ok(Array.isArray(alerts.body.alerts));
  } finally { await t.close(); }
});
