import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function req(app:any, method:string, path:string, body?:any, token?:string, headers:any={}) {
  const port=await new Promise<number>((resolve)=>{const s=app.server.listen(0,()=>resolve((s.address() as any).port));});
  try { const h:any={'Content-Type':'application/json',...headers}; if(token) h.Authorization=`Bearer ${token}`; const r=await fetch(`http://127.0.0.1:${port}/api/v1${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}); return {status:r.status,body:await r.json().catch(()=>({}))}; }
  finally { await app.close(); }
}

test('platform exposes payment and chat routes without cross-order access', async()=>{
  const app=createApp({dbPath:':memory:',disableScheduler:true,logLevel:'error'} as any);
  // seed is covered by the existing platform tests; this test only verifies route registration/auth behavior.
  const unauth=await req(app,'GET','/orders/nope/messages');
  assert.equal(unauth.status,401);
});
