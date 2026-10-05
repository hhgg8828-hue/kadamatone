import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp, registerUser, loginAdmin } from './helpers.js';

test('V66.12: مشوار الدباب لا يتوقف إذا تعطل التوجيه الخارجي ويستخدم احتياط المسافة', async()=>{
  const t=await startApp({ROUTING_URL:'https://127.0.0.1:1',ROUTING_TIMEOUT_MS:'50'} as any);
  try{
    const c=await registerUser(t.api);
    const r=await t.api('POST','/api/v1/trips/estimate',{token:c.body.accessToken,body:{origin:{lat:13.9759,lng:44.1709},destination:{lat:13.98,lng:44.18},stops:[]}});
    assert.equal(r.status,200,r.text); assert.ok(r.body.distanceKm>0); assert.equal(r.body.method,'STRAIGHT_LINE_TEST');
    const o=await t.api('POST','/api/v1/trips',{token:c.body.accessToken,headers:{'Idempotency-Key':'trip-fallback-1'},body:{origin:{lat:13.9759,lng:44.1709},destination:{lat:13.98,lng:44.18},purpose:'PASSENGER',description:'مشوار تجريبي للعميل',contactPhone:c.creds.phone}});
    assert.equal(o.status,201,o.text); assert.ok(o.body.order?.id);
  } finally { await t.close(); }
});

test('V66.12: اعتماد المركبة يعمل أيضًا عبر المسار القديم /verify', async()=>{
  const t=await startApp();
  try{
    const admin=await loginAdmin(t.api); const p=await registerUser(t.api,{role:'PROVIDER',provider:{providerType:'DRIVER',displayName:'سائق تجريبي',bio:'',specialty:'دباب'}}); assert.equal(p.status,201,p.text);
    const login=await t.api('POST','/api/v1/auth/login',{body:{identifier:p.creds.email,password:p.creds.password}}); assert.equal(login.status,200,login.text);
    const v=await t.api('POST','/api/v1/provider/vehicles',{token:login.body.accessToken,body:{vehicleType:'MOTORCYCLE',make:'دباب',model:'2020',year:2020,color:'أسود',plateNumber:'V66-10'}});
    assert.equal(v.status,201,v.text);
    const r=await t.api('PATCH',`/api/v1/admin/vehicles/${v.body.vehicle.id}/verify`,{token:admin,body:{status:'VERIFIED'}});
    assert.equal(r.status,200,r.text); assert.equal(r.body.vehicle.status,'VERIFIED');
  } finally { await t.close(); }
});

test('V66.12: واجهة مقدم الخدمة تعيد عرض العرض الجديد فور ظهوره وتستخدم cache bust', async()=>{
  const fs=await import('node:fs');
  const app=fs.readFileSync('public/app.ts','utf8'); const provider=fs.readFileSync('public/provider.html','utf8'); const admin=fs.readFileSync('public/admin.html','utf8');
  assert.match(app,/providerPollTimer=window\.setInterval[\s\S]*?2000/); assert.match(app,/if\(addedOffers\.length\)/); assert.match(provider,/app\.js\?v=66\.12/); assert.match(admin,/app\.js\?v=66\.12/);
});
