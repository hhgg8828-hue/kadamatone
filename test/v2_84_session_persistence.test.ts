import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('public/app.ts', 'utf8');
const auth = fs.readFileSync('src/modules/auth.ts', 'utf8');

test('V2.84: refresh is single-flight and transient failures preserve saved sessions', () => {
  assert.match(app, /let refreshPromise:Promise<RefreshResult>\|null=null/);
  assert.match(app, /if\(refreshPromise\)return refreshPromise/);
  assert.match(app, /if\(outcome\.result==='invalid'\)[\s\S]*?localStorage\.removeItem\(SESSION_KEY\)/);
  assert.match(app, /SESSION_CHECK_TEMPORARY/);
  assert.match(app, /تعذر التحقق من الجلسة بسبب الاتصال بالخادم[\s\S]*بقي حسابك محفوظًا/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /window\.addEventListener\('pageshow'/);
});

test('V2.84: refresh rotation handles short parallel-tab races without revoking the active family', () => {
  assert.match(auth, /'SESSION_ROTATED'/);
  assert.match(auth, /currentAgeMs <= 30_000/);
  assert.match(auth, /auth\.refresh_reuse_detected/);
});
