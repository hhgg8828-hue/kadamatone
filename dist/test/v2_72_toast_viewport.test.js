import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync('public/css/app.css', 'utf8');
const app = fs.readFileSync('public/app.ts', 'utf8');
test('v2.72 toast is positioned inside its full-width viewport host, not fixed at 50% of the screen', () => {
    assert.match(css, /\.live-toast\{position:relative;top:auto;left:auto;transform:none;/);
    assert.match(css, /#liveToasts\{right:max\(8px,env\(safe-area-inset-right,0px\)\)!important;left:max\(8px,env\(safe-area-inset-left,0px\)\)!important/);
    assert.match(css, /#liveToasts>div\{width:100%!important;max-width:none!important;min-width:0!important/);
    assert.match(app, /className='live-toast-host'/);
});
//# sourceMappingURL=v2_72_toast_viewport.test.js.map