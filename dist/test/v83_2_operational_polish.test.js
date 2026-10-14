import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('V83.2: جميع بوابات التطبيق تستخدم إصدار الأصول الجديد', () => {
    for (const file of ['public/index.html', 'public/customer.html', 'public/provider.html', 'public/admin.html']) {
        const html = fs.readFileSync(file, 'utf8');
        assert.ok(html.includes('app.js?v=2.36'), `${file} should use V83.2 assets`);
    }
    assert.ok(fs.readFileSync('public/sw.js', 'utf8').includes('khadamat-shell-v2-36'));
});
test('V83.2: لوحة الإدارة ومؤشرات مقدم الخدمة تستخدم تخطيطًا متجاوبًا وألوانًا خضراء', () => {
    const css = fs.readFileSync('public/css/app.css', 'utf8');
    assert.match(css, /\.admin-tabs\{display:flex;flex-wrap:nowrap;gap:7px;overflow-x:auto/);
    assert.match(css, /\.provider-command-strip\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:700px\)/);
    assert.match(css, /--primary:#176b4d/);
});
//# sourceMappingURL=v83_2_operational_polish.test.js.map