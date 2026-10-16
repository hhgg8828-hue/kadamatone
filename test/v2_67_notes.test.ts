import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src/modules/catalog.ts'), 'utf8');

test('V2.67: home screen removes redundant section titles and displays admin-created categories dynamically', () => {
  assert.ok(!app.includes('<h2>التصنيفات</h2>'));
  assert.ok(!app.includes('<h2>العروض القريبة منك</h2>'));
  assert.ok(!app.includes('<h2>الخدمات المتاحة</h2>'));
  assert.match(app, /const added=all\.filter/);
  assert.match(app, /customerMainCategories\(state\.cats\)/);
});

test('V2.67: customer header has customer-service modal and location arrow attached to its button', () => {
  assert.match(app, /customerContactToggle/);
  assert.match(app, /اتصل بخدمة العملاء/);
  assert.match(app, /wa\.me\/967778100022/);
  assert.match(app, /customer-contact-location-wrap/);
  assert.match(css, /\.customer-contact-location-wrap \.customer-area-arrow\{position:absolute;right:-4px;bottom:-5px/);
});

test('V2.67: order cards show total and only repeat completed or cancelled orders', () => {
  assert.match(app, /const canRepeat=completed\|\|cancelled/);
  assert.match(app, /order-repeat-btn-wide/);
  assert.match(app, /order-card-detail-separator/);
  assert.match(app, /إجمالي الطلب/);
});

test('V2.67: service editor validates all known invalid fields in one pass', () => {
  assert.match(app, /const validationErrors:\{name:string,message:string\}\[\]=\[\]/);
  assert.match(app, /validationErrors\.map\(x=>x\.message\)/);
  assert.match(app, /DUPLICATE_SLUG/);
  assert.match(catalog, /DUPLICATE_SLUG/);
});

test('V2.67: admin category endpoint supports creating categories without code changes', () => {
  assert.match(app, /openCategoryEditor\(null,draw,cats\)/);
  assert.match(app, /body\.parentId=parentId/);
  assert.match(catalog, /r\.post\('\/admin\/categories'/);
  assert.match(catalog, /INSERT INTO categories/);
});
