# خدمات — V4 Customer UI fixes

## What changed
- جعل قسم «الخدمات» تفاعليًا ويعرض الأقسام الستة من قاعدة البيانات.
- جعل «طلباتي» تبويبًا فعليًا يعرض الطلبات ويتيح فتح تفاصيل الطلب.
- إضافة بحث حي عن الخدمات عبر `POST /api/v1/search/intent`.
- أثناء الكتابة تظهر اقتراحات الخدمات المطابقة مع اسم الخدمة والقسم والأيقونة.
- الضغط على أي اقتراح يفتح نموذج الطلب الخاص بالخدمة مباشرة.
- إضافة زر لمسح البحث وتحسين تجربة الهاتف.
- الإبقاء على الكتالوج ديناميكيًا؛ لا توجد قائمة خدمات ثابتة داخل الواجهة.

## Verification
- `npm run build` — passed
- `npm run test` — 87/87 passed
- `npm run seed:demo` — passed
- `/health` — HTTP 200
- `/` — HTTP 200
- `POST /api/v1/search/intent` with `{"text":"نقل"}` — returns transport service suggestions
