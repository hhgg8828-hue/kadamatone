# خدمات V66.7 — Release

هذه النسخة مبنية مباشرة على V66.6 ولا تستبدل قاعدة البيانات أو البيانات الحالية.

## التحقق
- `npm run typecheck` — ناجح
- `npm run build` — ناجح
- `npm test` — 195/195 ناجح، 0 فشل

## أبرز التنفيذ
- Natural Language -> Intent -> Structured Task -> Capability-aware Matching -> Order.
- Temporary services/campaigns with server-side time validity and priority ordering.
- Dynamic request flow for temporary services.
- Compound order tasks and smart execution timeline.
- Automatic recovery when an accepted provider goes offline before execution.
- Urgent priority included in matching score.
- Map CDN fallback and no-map coordinate/GPS fallback.
- Admin RTL hardening.
