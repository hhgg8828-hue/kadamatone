# Khadamat V83.0 — Design system refresh

- Introduced a unified green/white/soft-neutral visual system across customer, provider, and admin surfaces.
- Replaced the customer service/category emoji tiles with lightweight inline SVG service illustrations selected by service intent/name.
- Added a compact animated service-icon ribbon to the customer home above the request composer/news ticker.
- Refined the app brand mark, card borders, action buttons, status chips, and focus states.
- Preserved the existing “ابدأ بسرعة / الوصول السريع” content and behavior; no changes to its service selection logic.
- Bumped the service-worker cache key to V83.0 so deployed clients can receive updated assets.

## Validation
- `npm run build` passed.
- Focused customer-experience, GPS-link, and V82.8 requirements tests passed (14 tests).
