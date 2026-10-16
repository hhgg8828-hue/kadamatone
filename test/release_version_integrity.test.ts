import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version as string;

test('release version is consistent across all app shells and cache assets', () => {
  assert.match(version, /^\d+\.\d+$/);
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.includes(`app.js?v=${version}`), `${file}: JS version must match package.json`);
    assert.ok(html.includes(`app.css?v=${version}`), `${file}: CSS version must match package.json`);
    assert.ok(html.includes(`/sw.js?v=${version}`), `${file}: service-worker URL must match package.json`);
  }
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert.ok(sw.includes(`khadamat-shell-v${version.replace('.', '-')}`), 'service worker cache must be versioned with package.json');
});
