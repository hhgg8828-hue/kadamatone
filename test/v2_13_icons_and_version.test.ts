import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('2.13.3: public release version and PWA cache are aligned', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.version, '2.13.3');
  for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
    assert.ok(fs.readFileSync(file, 'utf8').includes('v=2.13.3'), `${file} should use current assets`);
  }
  assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-13-3'));
});

test('2.13.3: every install manifest points to matching role-specific icon files', () => {
  const pairs = [
    ['public/manifest.webmanifest', 'icon-192.png', 'icon-512.png'],
    ['public/manifest-customer.webmanifest', 'icon-customer-192.png', 'icon-customer-512.png'],
    ['public/manifest-provider.webmanifest', 'icon-provider-192.png', 'icon-provider-512.png'],
    ['public/manifest-admin.webmanifest', 'icon-admin-192.png', 'icon-admin-512.png'],
  ];
  for (const [manifestPath, small, large] of pairs) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sources = manifest.icons.map((icon: {src: string}) => icon.src.split('/').pop());
    assert.ok(sources.includes(small), `${manifestPath} should reference ${small}`);
    assert.ok(sources.includes(large), `${manifestPath} should reference ${large}`);
    for (const icon of [small, large]) assert.ok(fs.existsSync(`public/icons/${icon}`), `${icon} must exist`);
  }
});
