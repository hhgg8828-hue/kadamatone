import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.');
const app = readFileSync(resolve(root, 'public/app.ts'), 'utf8');
const css = readFileSync(resolve(root, 'public/css/app.css'), 'utf8');
test('V2.65: لوحة الإدارة مقسمة حسب أولوية التشغيل مع بقاء أقسام المراقبة بارزة', () => {
    assert.ok(app.includes('التشغيل اليومي والمراقبة'));
    assert.ok(app.includes('الخدمات والتشغيل'));
    assert.ok(app.includes('المتابعة والتقارير'));
    assert.ok(app.includes('الإدارة والإعدادات (أقل استخدامًا)'));
    for (const tab of ['confirmations', 'orders', 'liveOps', 'live', 'alerts', 'complaints', 'catalog', 'temporary', 'campaigns']) {
        assert.ok(app.includes(`data-admin-tab="${tab}"`), `missing tab ${tab}`);
    }
    assert.ok(css.includes('.admin-nav-items'));
    assert.ok(css.includes('@media(max-width:600px)'));
});
test('V2.65: محرر الخدمة يحدد حقل الخطأ وينقل التركيز إليه ويحقق السعر حسب نوع التسعير', () => {
    assert.ok(app.includes('const failField=(name:string,message:string)'));
    assert.ok(app.includes("control?.scrollIntoView({behavior:'smooth',block:'center'})"));
    assert.ok(app.includes("pricingType==='FIXED'"));
    assert.ok(app.includes("'أدخل سعرًا ثابتًا صحيحًا (صفر أو أكثر).'"));
    assert.ok(app.includes('fieldHints.find(([pattern])=>pattern.test(message))'));
    assert.ok(app.includes('تفاصيل الخادم: ${message}'));
    assert.ok(css.includes('.service-editor-modal .field.field-invalid'));
});
//# sourceMappingURL=v2_65_admin_navigation_validation.test.js.map