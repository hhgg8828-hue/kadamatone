import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('public/app.ts', 'utf8');
const css = fs.readFileSync('public/css/app.css', 'utf8');

test('v2.64: temporary offer ticker is a clear CTA and uses explicit active time windows', () => {
  assert.match(app, /x\.isActive===true&&Number\.isFinite\(start\)&&Number\.isFinite\(end\)&&start<=now&&end>now/);
  assert.match(app, /اضغط هنا لعرض \$\{temporaryTitle\}/);
  assert.match(app, /activeTemporaryService\?'عرض مؤقت':'آخر الأخبار'/);
  assert.match(app, /data-temp-id=/);
});

test('v2.64: All Categories stays fixed and category art grows slightly', () => {
  assert.match(css, /\.all-categories-tile\{position:sticky;right:0/);
  assert.match(css, /customer-category-art\{width:49px;height:49px;flex-basis:49px/);
  assert.match(css, /temporary-offer-ticker/);
});
