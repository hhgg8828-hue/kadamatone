# خدمات (Khadamat)

**كل خدمة تحتاجها... في مكان واحد.**


### تشغيل الإنتاج / Railway

عند تشغيل الخادم، يتم تطبيق الـ migrations وتشغيل `seed` الأساسي تلقائيًا وبشكل idempotent؛ لذلك لا يلزم تشغيل `npm run seed` يدويًا بعد كل نشر. يشمل ذلك أقسام وخدمات الكتالوج وحساب المدير الأول والإعدادات الافتراضية.

في Railway، لأن SQLite تعتمد على نظام ملفات، يجب ربط **Volume دائم** بمسار قاعدة البيانات (`DB_PATH`) حتى لا تضيع الطلبات والحسابات عند إعادة إنشاء الحاوية. كما يجب ضبط `JWT_SECRET` ويفضل ضبط `ADMIN_PASSWORD` صراحةً.

## حالة النسخة
هذه الحزمة هي نسخة **Backend Core MVP** مكتملة للاختبار المحلي. تتضمن المصادقة والصلاحيات والكتالوج والمناطق ومقدمي الخدمات ودورة الطلب الكاملة والإسناد والعروض والتقييمات والشكاوى والإشعارات والجدولة والدفع النقدي كـAdapter.

> **مهم:** الـProduction Stack المستهدف ما زال `NestJS + PostgreSQL + Redis + React/TypeScript PWA`. هذه الحزمة تستخدم `Node.js + TypeScript + SQLite` وطبقات Ports/Adapters حتى يمكن اختبار منطق النظام دون الاعتماد على خدمات خارجية. لا تدّعي هذه النسخة أنها NestJS/PostgreSQL/Redis.

## ما تم اختباره
- TypeScript strict typecheck: `0` أخطاء.
- `87/87` اختبارًا ناجحًا بعد البناء إلى JavaScript وتشغيل الاختبارات المجمعة.
- Authentication / Refresh Token Rotation / RBAC / Rate Limiting.
- الإعدادات اليمنية: `YE` / `YER` / `Asia/Aden` / Arabic RTL.
- الأقسام الستة الرسمية والكتالوج الديناميكي.
- إنشاء الطلب والتحقق من نموذج الخدمة.
- الإسناد والموافقة الذرية بين المزودين.
- دورة الحالات حتى `COMPLETED`.
- عروض الأسعار `QUOTE`.
- الإلغاء والدفع عبر Payment Port.
- التقييمات والشكاوى والحسم الإداري.
- Scheduler للموجات وانتهاء المهلات.
- HTTP security hardening ورفع الملفات.

## الأقسام الستة في الـMVP
1. النقل
2. التوصيل
3. خدمات المنزل
4. الصيانة
5. المعاملات
6. العمالة عند الطلب

الخدمات والفئات قابلة للإدارة من قاعدة البيانات وليست Hard-coded في الواجهة.

## المتطلبات
- Node.js 22+
- npm

بعد فك الضغط:

```bash
npm install
npm run build
```

## التشغيل

### إنشاء قاعدة البيانات
```bash
npm run migrate
npm run seed
```

لبيانات التطوير التجريبية:

```bash
npm run seed:demo
```

### تشغيل الخادم
```bash
npm start
```

ثم:

```text
http://localhost:3000/health
```

### الاختبارات
```bash
npm test
```

### فحص TypeScript فقط
```bash
npm run typecheck
```

### النسخ الاحتياطي
```bash
npm run backup
```

## إعدادات البيئة
انسخ:

```bash
cp .env.example .env
```

على Windows يمكنك نسخ الملف يدويًا باسم `.env`.

أهم الإعدادات:

- `NODE_ENV`
- `PORT`
- `DB_PATH`
- `UPLOAD_DIR`
- `JWT_SECRET`
- `ACCESS_TTL_SEC`
- `REFRESH_TTL_DAYS`
- `CORS_ORIGINS`
- `ADMIN_NAME`
- `ADMIN_PHONE`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

في الإنتاج يجب استخدام `JWT_SECRET` قويًا وعدم استخدام بيانات المدير التجريبية.

## البنية

```text
src/
  core/              HTTP, validation, security, logging, rate limiting
  db/                SQLite adapter, migrations, seed, CLI
  modules/           auth, catalog, orders, assignment, quotes,
                     ratings, complaints, providers, notifications,
                     scheduler, settings, admin...
  ports/             matching, payment, storage, intent
  app.ts             composition root
  server.ts          HTTP server
shared/
  orderStateMachine.ts
```

## الانتقال إلى Production Stack

طبقات النظام مصممة بحيث يكون الانتقال تدريجيًا:

- SQLite → PostgreSQL عبر Db/Repository Adapter.
- Scheduler/Memory limiter → Redis/BullMQ أو خدمة Redis مكافئة.
- HTTP core → NestJS Controllers/Modules/Providers.
- React/TypeScript PWA وAdmin Dashboard تُبنى فوق REST API نفسه.

لا ينبغي تشغيل هذه النسخة كخدمة إنتاج قبل تنفيذ هذا الانتقال، وإجراء اختبارات تكامل على PostgreSQL وRedis وNestJS، واختبارات حمل ومراجعة أمنية.

## واجهات الويب المضافة
- `http://localhost:3000/` واجهة العميل
- `http://localhost:3000/provider.html` واجهة مقدم الخدمة
- `http://localhost:3000/admin` لوحة الإدارة
- `http://localhost:3000/health` فحص صحة الخادم

لبيانات التطوير المحلية لأول تشغيل استخدم:
`npm run seed:demo`

حسابات العرض التجريبي:
- العميل: `customer@demo.local` / `Demo12345`
- مقدم الخدمة: `provider@demo.local` / `Demo12345`

بيانات المدير تُحدد عبر `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` في `.env` أو تُنشأ كلمة مرور عشوائية عند أول seed إذا لم تُحدد.
