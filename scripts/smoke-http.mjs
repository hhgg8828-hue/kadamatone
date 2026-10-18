const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const checks = [
  ['/', 200, 'text/html'],
  ['/customer', 200, 'text/html'],
  ['/provider', 200, 'text/html'],
  ['/admin', 200, 'text/html'],
  ['/health', 200, 'application/json'],
  ['/ready', 200, 'application/json'],
  ['/manifest.webmanifest', 200, 'application/manifest+json'],
  ['/manifest-customer.webmanifest', 200, 'application/manifest+json'],
  ['/manifest-provider.webmanifest', 200, 'application/manifest+json'],
  ['/manifest-admin.webmanifest', 200, 'application/manifest+json'],
  ['/css/app.css', 200, 'text/css'],
  ['/js/app.js', 200, 'javascript'],
  ['/sw.js', 200, 'javascript'],
];
let failed = 0;
for (const [route, expectedStatus, expectedType] of checks) {
  try {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(5000) });
    const type = response.headers.get('content-type') || '';
    const body = await response.text();
    const statusOk = response.status === expectedStatus;
    const typeOk = type.includes(expectedType);
    let bodyOk = body.length > 0;
    if (route === '/health') bodyOk = bodyOk && JSON.parse(body).status === 'ok';
    if (route === '/ready') bodyOk = bodyOk && JSON.parse(body).status === 'ready';
    if (route.startsWith('/manifest')) {
      const manifest = JSON.parse(body);
      bodyOk = bodyOk && typeof manifest.name === 'string' && typeof manifest.start_url === 'string';
    }
    const ok = statusOk && typeOk && bodyOk;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${route} status=${response.status} type=${type} bytes=${body.length}`);
    if (!ok) failed++;
  } catch (error) {
    console.log(`FAIL ${route} error=${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}
console.log(`HTTP smoke checks: ${checks.length - failed}/${checks.length} passed`);
if (failed) process.exitCode = 1;
