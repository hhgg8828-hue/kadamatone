import type { Db } from '../types.js';
import type { Config } from '../config.js';
import { uuid, hashPassword, randomToken } from '../core/security.js';
import { iso } from '../core/util.js';
import { CATEGORIES, DEMO_AREAS } from './seed-data.js';
import { SETTINGS } from '../modules/settings.js';

const j = JSON.stringify;

/** Seed آمن لإعادة التشغيل (Idempotent): لا يكرر ولا يفرط في الكتابة فوق تعديلات المدير. */
export async function seedBase(db: Db, config: Config) {
  const now = iso();
  const out: { categories: number; services: number; adminCreated: boolean; adminPassword: string | null } = { categories: 0, services: 0, adminCreated: false, adminPassword: null };
  db.tx(() => {
    db.run(`INSERT OR IGNORE INTO cancellation_policies(id,name,free_until_status,allowed_until_status,fee_percent) VALUES ('default','السياسة الافتراضية','ASSIGNED','ON_THE_WAY',0)`);
    // نطاق جغرافي عام لليمن كبيانات وصفية فقط. لا يستخدم لتحديد تغطية مقدم الخدمة؛
    // قبول الطلب يعتمد على GPS الفعلي، والمطابقة لاحقًا تعتمد على أقرب مقدم خدمة.
    db.run(`INSERT OR IGNORE INTO service_areas(id,parent_id,name_i18n,type,center_lat,center_lng,radius_km,created_at,updated_at)
            VALUES ('system-yemen',NULL,?,'COUNTRY',15.55,48.52,2000,?,?)`, j({ ar: 'اليمن', en: 'Yemen' }), now, now);
    // الإعدادات الافتراضية تُكتب في القاعدة لتظهر وتُعدَّل من اللوحة (لا تُستبدل إن كانت موجودة)
    for (const [key, m] of Object.entries(SETTINGS)) db.run('INSERT OR IGNORE INTO system_settings(key,value,description,updated_at) VALUES (?,?,?,?)', key, j(m.def), m.desc, now);
    CATEGORIES.forEach((c, ci) => {
      let cat = db.get('SELECT id FROM categories WHERE slug = ?', c.slug);
      if (!cat) {
        cat = { id: uuid() };
        db.run('INSERT INTO categories(id,slug,name_i18n,icon,keywords,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', cat.id, c.slug, j(c.name), c.icon, j(c.keywords), ci + 1, now, now);
        out.categories++;
      }
      c.services.forEach((sv, si) => {
        if (db.get('SELECT 1 FROM services WHERE slug = ?', sv.slug)) return;
        db.run(`INSERT INTO services(id,category_id,slug,name_i18n,icon,keywords,pricing_type,base_price,form_schema,cancellation_policy_id,requires_inspection,requires_vehicle,supports_waiting,sort_order,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, uuid(), cat.id, sv.slug, j(sv.name), sv.icon, j(sv.keywords), sv.pricing, sv.pricing === 'FIXED' ? sv.price : null, j(sv.form), 'default', (sv as any).requiresInspection?1:0, (sv as any).requiresVehicle?1:0, (sv as any).supportsWaiting?1:0, si + 1, now, now);
        out.services++;
      });
    });
    // طلب خدمة غير موجودة يجب أن يُزرع بعد الأقسام لأن migrations تُطبق قبل seedBase.
    if (!db.get('SELECT 1 FROM services WHERE slug=?','custom-request')) {
      const cat=db.get<{id:string}>('SELECT id FROM categories WHERE slug=?','delivery');
      if(cat) db.run(`INSERT INTO services(id,category_id,slug,name_i18n,description_i18n,icon,keywords,pricing_type,base_price,form_schema,cancellation_policy_id,default_priority,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, uuid(),cat.id,'custom-request',j({ar:'طلب خدمة أخرى',en:'Custom service request'}),j({ar:'اطلب أي خدمة غير موجودة في القائمة مع وصف وصورة اختيارية',en:'Request any service not listed'}),'✨',j(['أخرى','خدمة أخرى','طلب خاص','غير موجودة']),'QUOTE',null,'[]','default','NORMAL',999,1,now,now);
    }
  });
  // مدير النظام الأول
  const a = config.admin;
  if (!db.get('SELECT 1 FROM admin_users WHERE admin_level = ?', 'SUPER_ADMIN')) {
    const password = a.password || (config.isProd ? randomToken(12) + 'a1' : 'Admin12345');
    const hash = await hashPassword(password);
    const id = uuid();
    db.tx(() => {
      db.run('INSERT INTO users(id,role_id,full_name,phone,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, 3, a.name, a.phone, a.email.toLowerCase(), hash, now, now);
      db.run(`INSERT INTO admin_users(user_id, admin_level) VALUES (?, 'SUPER_ADMIN')`, id);
    });
    out.adminCreated = true;
    out.adminPassword = a.password ? '(من ADMIN_PASSWORD)' : password;
  }
  return out;
}

/** بيانات تجريبية للتطوير فقط — ترفض العمل في الإنتاج. */
export async function seedDemo(db: Db, config: Pick<Config, 'isProd'>) {
  if (config.isProd) throw new Error('seed:demo is not allowed in production');
  const now = iso();
  const ids: Record<string, string> = {};
  db.tx(() => {
    for (const a of DEMO_AREAS) {
      const ex = db.get(`SELECT id FROM service_areas WHERE json_extract(name_i18n,'$.en') = ?`, a.name.en);
      ids[a.key] = ex?.id || uuid();
      if (!ex) db.run('INSERT INTO service_areas(id,parent_id,name_i18n,type,center_lat,center_lng,radius_km,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', ids[a.key], a.parent ? ids[a.parent] : null, j(a.name), a.type, a.lat, a.lng, a.radius, now, now);
    }
  });
  const users = [
    ['demo-customer', 'عميل تجريبي', '+967770000001', 'customer@demo.local', 1],
    ['demo-provider', 'فني تجريبي', '+967770000002', 'provider@demo.local', 2],
  ];
  const password = 'Demo12345';
  const hash = await hashPassword(password);
  for (const [, name, phone, email, role] of users) {
    if (db.get('SELECT 1 FROM users WHERE phone = ?', phone)) continue;
    const id = uuid();
    db.tx(() => {
      db.run('INSERT INTO users(id,role_id,full_name,phone,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, role, name, phone, email, hash, now, now);
      if (role === 2) db.run(`INSERT INTO service_providers(id,user_id,provider_type,display_name,verification_status,verified_at,base_lat,base_lng,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, uuid(), id, 'TECHNICIAN', name, 'VERIFIED', now, 12.79, 45.02, now, now);
    });
  }
  return { password, accounts: users.map((u) => u[3]) };
}
