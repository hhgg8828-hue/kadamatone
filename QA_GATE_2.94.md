# بوابة التحقق قبل الإصدار — خدمات 2.94

- [x] TypeScript typecheck
- [x] Build
- [x] 516/516 automated tests passed across 113 files
- [x] 28/28 focused auth/config/navigation/version tests passed
- [x] Local HTTP smoke checks: 13/13
- [x] Production APP_ENV guard remains in place for demo login mode
- [x] Version and service-worker cache updated to 2.94
- [ ] Visual interaction test on Railway/mobile device — pending

## Release caution
وضع الرمز التجريبي لا يتحقق من ملكية رقم الهاتف، ويسمح بإنشاء/الدخول إلى حساب عميل باستخدام أي رقم صالح إذا تُركت قائمة الاختبار فارغة. يجب تشغيله فقط على خدمة staging منفصلة وقاعدة بيانات اختبار لا تحتوي بيانات حقيقية، ثم تعطيله قبل الإطلاق.
