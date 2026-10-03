import type { Row } from '../src/types.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { TestApp, Api } from './helpers.js';
import { startApp, registerUser, loginAdmin } from './helpers.js';
import { seedBase } from '../src/db/seed.js';
import { validateFormData, formSchemaSchema } from '../src/modules/catalog.js';
import { parse } from '../src/core/validate.js';
import { canTransition, allowedNext } from '../shared/orderStateMachine.js';

let t: TestApp, api: Api;
before(async () => { t = await startApp(); api = t.api; });
after(async () => { await t.close(); });

describe('Database & Seed', () => {
  test('الجداول المطلوبة كلها موجودة', () => {
    const need = ['users','roles','service_providers','provider_documents','categories','services','service_areas','orders','order_status_history','order_assignments','provider_availability','ratings','reviews','notifications','complaints','addresses','locations','admin_users','system_settings','audit_logs','quotes','payments'];
    const have = new Set(t.app.db.all(`SELECT name FROM sqlite_master WHERE type='table'`).map((r: Row) => r.name));
    for (const n of need) assert.ok(have.has(n), `الجدول ${n} مفقود`);
  });
  test('المفاتيح الأجنبية مفعّلة والقيود تعمل (تقييم 6 مرفوض)', () => {
    assert.equal(t.app.db.one('PRAGMA foreign_keys').foreign_keys, 1);
    assert.throws(() => t.app.db.run(`INSERT INTO ratings(id,order_id,customer_id,provider_id,score,created_at) VALUES ('x','nope','nope','nope',6,'now')`));
  });
  test('الأقسام الأساسية بأسمائها الصحيحة وبالترتيب', async () => {
    const r = await api('GET', '/api/v1/categories');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.categories.map((c: Row) => c.name), ['النقل', 'التوصيل', 'خدمات المنزل', 'خدمات السيارات', 'الصيانة', 'المعاملات', 'العمالة عند الطلب']);
    assert.deepEqual(r.body.categories.map((c: Row) => c.icon), ['🚗', '📦', '🏠', '🚘', '🔧', '🏛️', '👷']);
  });
  test('خدمات المنزل تحتوي الخدمات المطلوبة', async () => {
    const r = await api('GET', '/api/v1/categories/home-services/services');
    assert.deepEqual(r.body.services.map((s: Row) => s.name), ['كهرباء', 'سباكة', 'تنظيف', 'تكييف', 'نجارة', 'صيانة أجهزة']);
  });
  test('خدمات السيارات تحتوي خدمات النظافة والإنقاذ والبطارية والصيانة القابلة للتوسع', async () => {
    const r = await api('GET', '/api/v1/categories/car-services/services');
    assert.equal(r.status, 200);
    const slugs = r.body.services.map((s: Row) => s.slug);
    assert.deepEqual(slugs.sort(), ['mobile-car-wash','car-interior-deep-cleaning','car-battery-service'].sort());
    const wash = r.body.services.find((s: Row) => s.slug === 'mobile-car-wash');
    assert.equal(wash.pricingType, 'QUOTE');
    const washFull = (await api('GET', `/api/v1/services/${wash.id}`)).body.service;
    assert.ok(washFull.formSchema.some((f: Row) => f.key === 'wash_scope'));
    const battery = r.body.services.find((s: Row) => s.slug === 'car-battery-service');
    const batteryFull = (await api('GET', `/api/v1/services/${battery.id}`)).body.service;
    assert.ok(batteryFull.formSchema.some((f: Row) => f.key === 'issue')); 
  });
  test('النقل يحتوي الخدمات المطلوبة', async () => {
    const r = await api('GET', '/api/v1/categories/transport/services');
    assert.deepEqual(r.body.services.map((s: Row) => s.name), ['مشاوير بالدباب', 'سيارة مع سائق', 'نقل أفراد', 'نقل بضائع', 'نقل أثاث']);
  });
  test('Seed قابل لإعادة التشغيل بدون تكرار', async () => {
    const before = t.app.db.one('SELECT COUNT(*) c FROM services').c;
    const r = await seedBase(t.app.db, t.app.config);
    assert.equal(r.services, 0); assert.equal(r.categories, 0); assert.equal(r.adminCreated, false);
    assert.equal(t.app.db.one('SELECT COUNT(*) c FROM services').c, before);
  });
  test('نوعا التسعير موجودان: FIXED و QUOTE، وFIXED لا يُقبل بلا سعر (CHECK)', () => {
    assert.ok(t.app.db.get(`SELECT 1 FROM services WHERE pricing_type='FIXED'`));
    assert.ok(t.app.db.get(`SELECT 1 FROM services WHERE pricing_type='QUOTE'`));
    const cat = t.app.db.one('SELECT id FROM categories LIMIT 1');
    assert.throws(() => t.app.db.run(`INSERT INTO services(id,category_id,slug,name_i18n,pricing_type,created_at,updated_at) VALUES ('s1',?,'bad','{}','FIXED','n','n')`, cat.id));
  });
  test('الكتالوج ديناميكي: إضافة خدمة/قسم في DB تظهر فورًا بدون تعديل كود', async () => {
    t.app.db.run(`INSERT INTO categories(id,slug,name_i18n,icon,sort_order,created_at,updated_at) VALUES ('c-new','health-test','{"ar":"قسم تجريبي"}','🩺',99,'n','n')`);
    t.app.db.run(`INSERT INTO services(id,category_id,slug,name_i18n,pricing_type,base_price,created_at,updated_at) VALUES ('s-new','c-new','svc-test','{"ar":"خدمة تجريبية"}','FIXED',5,'n','n')`);
    t.app.catalog.invalidate();
    const r = await api('GET', '/api/v1/categories');
    const c = r.body.categories.find((x: Row) => x.slug === 'health-test');
    assert.equal(c.name, 'قسم تجريبي'); assert.equal(c.services[0].name, 'خدمة تجريبية');
    t.app.db.run(`UPDATE categories SET is_active = 0 WHERE id = 'c-new'`); t.app.catalog.invalidate();
    assert.ok(!(await api('GET', '/api/v1/categories')).body.categories.find((x: Row) => x.slug === 'health-test'), 'قسم معطّل لا يظهر');
  });
  test('GET /services/:id يعيد formSchema', async () => {
    const list = await api('GET', '/api/v1/categories/home-services/services');
    const ac = list.body.services.find((s: Row) => s.slug === 'air-conditioning');
    const r = await api('GET', `/api/v1/services/${ac.id}`);
    assert.equal(r.body.service.pricingType, 'FIXED');
    assert.ok(r.body.service.formSchema.find((f: Row) => f.key === 'ac_type'));
  });
});

describe('Dynamic form validation (server-side)', () => {
  const schema = parse(formSchemaSchema, [
    { key: 'workers_count', type: 'number', label: { ar: 'عدد' }, required: true, min: 1, max: 50 },
    { key: 'kind', type: 'select', label: { ar: 'نوع' }, options: [{ value: 'a', label: { ar: 'أ' } }] },
  ]);
  test('يقبل بيانات صحيحة ويحذف الحقول غير المعرّفة', () => {
    assert.deepEqual(validateFormData(schema, { workers_count: 3, kind: 'a', hacker: 'x' }), { workers_count: 3, kind: 'a' });
  });
  test('يرفض حقلًا إلزاميًا مفقودًا وقيمًا خارج النطاق وخيارًا غير مسموح', () => {
    assert.throws(() => validateFormData(schema, {}), (e: any) => e.status === 422);
    assert.throws(() => validateFormData(schema, { workers_count: 500 }), (e: any) => e.status === 422);
    assert.throws(() => validateFormData(schema, { workers_count: 2, kind: 'zzz' }), (e: any) => e.status === 422);
  });
});

describe('Intent search (keyword)', () => {
  test('«المكيف خربان وأحتاج شخص يصلحه اليوم» → تكييف + URGENT', async () => {
    const r = await api('POST', '/api/v1/search/intent', { body: { text: 'المكيف خربان وأحتاج شخص يصلحه اليوم' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.matches[0].serviceSlug, 'air-conditioning');
    assert.equal(r.body.matches[0].categorySlug, 'home-services');
    assert.equal(r.body.priority, 'URGENT');
  });
  test('«أحتاج كهربائيًا يصل إلى منزلي» → كهرباء', async () => {
    const r = await api('POST', '/api/v1/search/intent', { body: { text: 'أحتاج كهربائيًا يصل إلى منزلي' } });
    assert.equal(r.body.matches[0].serviceSlug, 'electricity');
  });
  test('«أحتاج تنظيف مبنى كامل» → تنظيف (QUOTE)', async () => {
    const r = await api('POST', '/api/v1/search/intent', { body: { text: 'أحتاج تنظيف مبنى كامل' } });
    assert.equal(r.body.matches[0].serviceSlug, 'cleaning');
  });
  test('نص بلا تطابق → قائمة فارغة', async () => {
    const r = await api('POST', '/api/v1/search/intent', { body: { text: 'zzzzzz qqqq' } });
    assert.deepEqual(r.body.matches, []);
  });
});

describe('Provider profile basics & privacy', () => {
  test('مزود غير موثق: لا يستطيع Online، والملف العام 404 للغرباء ويظهر لصاحبه وللإدارة', async () => {
    const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: 'فني' } });
    assert.equal((await api('POST', '/api/v1/provider/online', { token: p.body.accessToken, body: { online: true } })).status, 403);
    const pid = (await api('GET', '/api/v1/auth/me', { token: p.body.accessToken })).body.provider.id;
    assert.equal((await api('GET', `/api/v1/providers/${pid}`)).status, 404);
    assert.equal((await api('GET', `/api/v1/providers/${pid}`, { token: p.body.accessToken })).status, 200);
    assert.equal((await api('GET', `/api/v1/providers/${pid}`, { token: await loginAdmin(api) })).status, 200);
  });
  test('شارة «موثق» لا تظهر إلا بعد VERIFIED', async () => {
    const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN', displayName: 'فني موثق' } });
    const pid = (await api('GET', '/api/v1/auth/me', { token: p.body.accessToken })).body.provider.id;
    t.app.db.run(`UPDATE service_providers SET verification_status = 'VERIFIED' WHERE id = ?`, pid);
    const pub = await api('GET', `/api/v1/providers/${pid}`);
    assert.equal(pub.status, 200); assert.equal(pub.body.provider.verified, true);
    assert.ok(!('userId' in pub.body.provider) && !JSON.stringify(pub.body).includes('phone'), 'الملف العام لا يكشف هاتف/معرّف المستخدم');
  });
  test('مزود يحدد خدماته ومناطقه وأوقات عمله', async () => {
    t.app.db.run(`INSERT INTO service_areas(id,name_i18n,type,center_lat,center_lng,radius_km,created_at,updated_at) VALUES ('a1','{"ar":"منطقة اختبار"}','CITY',12.79,45.02,20,'n','n')`);
    t.app.catalog.invalidate();
    const p = await registerUser(api, { role: 'PROVIDER', provider: { providerType: 'TECHNICIAN' } });
    const tok = p.body.accessToken;
    const svc = (await api('GET', '/api/v1/categories/home-services/services')).body.services[0];
    assert.equal((await api('PUT', '/api/v1/provider/services', { token: tok, body: { services: [{ serviceId: svc.id, experienceYears: 4 }] } })).status, 200);
    assert.equal((await api('PUT', '/api/v1/provider/services', { token: tok, body: { services: [{ serviceId: 'nope' }] } })).status, 422);
    assert.equal((await api('PUT', '/api/v1/provider/areas', { token: tok, body: { areaIds: ['a1'] } })).status, 200);
    assert.equal((await api('PUT', '/api/v1/provider/areas', { token: tok, body: { areaIds: ['bad'] } })).status, 422);
    const av = await api('PUT', '/api/v1/provider/availability', { token: tok, body: { slots: [{ weekday: 1, start: '09:00', end: '17:00' }] } });
    assert.equal(av.status, 200); assert.deepEqual(av.body.provider.availability, [{ weekday: 1, start: '09:00', end: '17:00' }]);
    assert.equal((await api('PUT', '/api/v1/provider/availability', { token: tok, body: { slots: [{ weekday: 1, start: '18:00', end: '17:00' }] } })).status, 422);
    const prof = await api('GET', '/api/v1/provider/profile', { token: tok });
    assert.equal(prof.body.provider.services[0].experienceYears, 4);
  });
});

describe('Addresses & profile', () => {
  test('عميل: عنوان جديد يُحدَّد منطقته من الإحداثيات ويكون الافتراضي', async () => {
    const c = await registerUser(api);
    const a = await api('POST', '/api/v1/me/addresses', { token: c.body.accessToken, body: { label: 'المنزل', location: { lat: 12.80, lng: 45.03, source: 'gps', addressText: 'شارع 1' } } });
    assert.equal(a.status, 201); assert.equal(a.body.address.isDefault, true); assert.equal(a.body.address.location.areaId, 'a1');
    const edited = await api('PATCH', `/api/v1/me/addresses/${a.body.address.id}`, { token: c.body.accessToken, body: { label: 'البيت الجديد', location: { lat: 12.81, lng: 45.04, accuracy: 25, source: 'gps' } } });
    assert.equal(edited.status, 200); assert.equal(edited.body.address.label, 'البيت الجديد'); assert.equal(edited.body.address.location.lat, 12.81);
    assert.equal((await api('POST', '/api/v1/me/addresses', { token: c.body.accessToken, body: { label: 'x', location: { lat: 200, lng: 0 } } })).status, 422);
  });
  test('عميل لا يعدّل/يحذف عنوان غيره (IDOR)', async () => {
    const a = await registerUser(api), b = await registerUser(api);
    const addr = await api('POST', '/api/v1/me/addresses', { token: a.body.accessToken, body: { label: 'س', location: { lat: 12.79, lng: 45.02 } } });
    const id = addr.body.address.id;
    assert.equal((await api('PATCH', `/api/v1/me/addresses/${id}`, { token: b.body.accessToken, body: { label: 'hack' } })).status, 404);
    assert.equal((await api('DELETE', `/api/v1/me/addresses/${id}`, { token: b.body.accessToken })).status, 404);
    assert.equal((await api('DELETE', `/api/v1/me/addresses/${id}`, { token: a.body.accessToken })).status, 204);
  });
  test('تعديل الملف الشخصي', async () => {
    const c = await registerUser(api);
    const r = await api('PATCH', '/api/v1/me/profile', { token: c.body.accessToken, body: { fullName: 'اسم جديد', locale: 'en' } });
    assert.equal(r.body.user.fullName, 'اسم جديد'); assert.equal(r.body.user.locale, 'en');
    const other = await registerUser(api, { email: 'dup@test.local' });
    assert.equal((await api('PATCH', '/api/v1/me/profile', { token: c.body.accessToken, body: { email: 'dup@test.local' } })).status, 409);
  });
});

describe('Files', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  test('رفع صورة صحيحة، والملف الخاص لا يقرؤه غير مالكه', async () => {
    const a = await registerUser(api), b = await registerUser(api);
    const up = await api('POST', '/api/v1/files', { token: a.body.accessToken, body: { purpose: 'order_attachment', dataBase64: PNG.toString('base64') } });
    assert.equal(up.status, 201); assert.equal(up.body.file.mime, 'image/png');
    const id = up.body.file.id;
    assert.equal((await api('GET', `/api/v1/files/${id}`)).status, 401);
    assert.equal((await api('GET', `/api/v1/files/${id}`, { token: b.body.accessToken })).status, 403);
    const own = await api('GET', `/api/v1/files/${id}`, { token: a.body.accessToken });
    assert.equal(own.status, 200); assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  });
  test('ملف تنفيذي/نص متنكر بنوع صورة مرفوض (فحص التوقيع)', async () => {
    const a = await registerUser(api);
    const r = await api('POST', '/api/v1/files', { token: a.body.accessToken, body: { purpose: 'avatar', dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') } });
    assert.equal(r.status, 422); assert.equal(r.body.error.code, 'UNSUPPORTED_FILE_TYPE');
  });
  test('الصورة الشخصية عامة (تُعرض بدون توكن)', async () => {
    const a = await registerUser(api);
    const up = await api('POST', '/api/v1/files', { token: a.body.accessToken, body: { purpose: 'avatar', dataBase64: PNG.toString('base64') } });
    assert.equal((await api('GET', `/api/v1/files/${up.body.file.id}`)).status, 200);
  });
});

describe('HTTP hardening', () => {
  test('ترويسات الأمان موجودة', async () => {
    const r = await api('GET', '/health');
    for (const h of ['x-content-type-options', 'x-frame-options', 'content-security-policy', 'referrer-policy', 'x-request-id']) assert.ok(r.headers.get(h), h);
  });
  test('JSON غير صالح → 400، محتوى غير JSON → 415', async () => {
    assert.equal((await api('POST', '/api/v1/auth/login', { body: '{bad', raw: true, headers: { 'Content-Type': 'application/json' } })).status, 400);
    assert.equal((await api('POST', '/api/v1/auth/login', { body: 'a=b', raw: true, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  });
  test('طلب ضخم → 413', async () => {
    const r = await api('POST', '/api/v1/auth/login', { body: JSON.stringify({ identifier: 'a'.repeat(300_000), password: 'x' }), raw: true, headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 413);
  });
  test('مسار غير موجود 404، طريقة خاطئة 405', async () => {
    assert.equal((await api('GET', '/api/v1/nope')).status, 404);
    assert.equal((await api('DELETE', '/api/v1/categories')).status, 405);
  });
  test('Path traversal على الملفات الثابتة لا يسرّب شيئًا', async () => {
    for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/shared/..%2f..%2f.env.example']) {
      const r = await api('GET', p);
      assert.ok([404, 400].includes(r.status), `${p} → ${r.status}`);
      assert.ok(!r.text.includes('khadamat"'));
    }
  });
  test('أخطاء الخادم لا تسرّب تفاصيل داخلية', async () => {
    const r = await api('GET', '/api/v1/orders/../../etc/passwd');
    assert.ok(!r.text.includes('/home/'));
  });
  test('حالات الطلب: آلة الحالات تمنع القفزات', () => {
    assert.equal(canTransition('PENDING', 'COMPLETED', 'PROVIDER'), false);
    assert.equal(canTransition('ACCEPTED', 'ON_THE_WAY', 'PROVIDER'), true);
    assert.equal(canTransition('ACCEPTED', 'ON_THE_WAY', 'CUSTOMER'), false);
    assert.equal(canTransition('COMPLETED', 'CANCELLED', 'CUSTOMER'), false);
    assert.deepEqual(allowedNext('DISPUTED', 'ADMIN').sort(), ['CANCELLED', 'COMPLETED']);
  });
});


test('customer portal link points directly to provider page', () => {
  const html = readFileSync(resolve('public/app.ts'), 'utf8');
  assert.match(html, /href=\"\/provider\.html\" data-provider-link/);
});
