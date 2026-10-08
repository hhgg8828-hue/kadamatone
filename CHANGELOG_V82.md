# V82 — Realtime administration + admin PWA fix

- Provider document upload/delete now broadcasts realtime `sync` events to provider and admin clients, including the second document uploaded while the provider is already `PENDING`.
- Provider verification/rejection/suspension broadcasts realtime updates to both the provider and admin interfaces.
- Added lightweight `/admin/realtime-state` change detector as a fallback so an open admin dashboard refreshes automatically even if a future write path forgets to emit SSE.
- Admin dashboard checks the lightweight change state every 2.5 seconds and redraws only when the database state changes.
- Kept SSE as the immediate realtime path.
- Prevented admin auto-refresh timer duplication when the admin UI redraws itself.
- Updated frontend cache/version to V82.
- Made the admin PWA manifest identity/start URL explicit (`/admin?app=admin`) and cache-busted the manifest reference.
- Updated all HTML references to `app.js?v=82.0` and Service Worker cache to `khadamat-shell-v82`.
