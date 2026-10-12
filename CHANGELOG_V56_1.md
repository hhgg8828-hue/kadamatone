# V56.1 — إصلاح زر بدء استقبال الطلبات على الهاتف

- تحديث cache-busting لملفات الواجهة من v53 إلى v56.
- تغيير Service Worker cache إلى `khadamat-shell-v56` لمنع تقديم JavaScript قديم للهاتف.
- تثبيت سلوك زر بدء/إيقاف استقبال الطلبات باللمس عبر `touch-action: manipulation` وطبقة stacking واضحة.
- جعل الزر `type="button"` وربط الحدث عبر `addEventListener('click', ...)`.
- لا تغيير في API أو منطق الصلاحيات والمطابقة.
