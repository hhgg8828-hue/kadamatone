# Prompt to continue Khadamat from the current checkpoint

You are continuing an existing project. DO NOT restart the project, do not redesign the backend from zero, and do not replace working modules with fake/static implementations.

Project name: Khadamat (خدمات)
Core slogan: كل خدمة تحتاجها... في مكان واحد.
Core proposition: لا تبحث عن مقدم الخدمة، اطلب الخدمة فقط.

## Current checkpoint
The current project already contains a TypeScript backend with:
- authentication and roles: CUSTOMER / PROVIDER / ADMIN
- SQLite database + migrations
- dynamic categories/services
- orders and order state machine
- provider assignment/offers
- quotes
- ratings
- complaints/disputes
- notifications/SSE foundations
- locations/areas
- cash payment adapter
- scheduler
- admin users/orders/areas/settings/audit APIs
- automated backend tests from the previous checkpoint

The missing/unfinished part was the web UI. The current checkpoint now adds a first connected web UI under `public/`:
- `/` customer interface
- `/provider.html` provider interface
- `/admin` admin interface
- `public/app.ts` is the TypeScript source
- `public/js/app.js` is the compiled browser file
- `public/css/app.css` contains the UI styles

The HTTP server now copies `public/` into `dist/public` during build so the static UI is actually served.

New admin APIs were also added:
- GET `/api/v1/admin/dashboard`
- GET `/api/v1/admin/providers`
- PATCH `/api/v1/admin/providers/:id/verification`

## Required next work
Continue from this exact state and improve it into a real MVP, preserving all existing backend behavior.

1. Inspect the existing backend before changing anything.
2. Keep TypeScript as the source language. Do not write a separate JavaScript implementation and later pretend it is TypeScript.
3. Keep the current modular-monolith architecture.
4. Improve the customer UI:
   - responsive Arabic RTL
   - login/register
   - dynamic categories/services from API
   - service details and dynamic form fields from service.formSchema
   - create real persisted orders
   - location picker / browser geolocation with manual fallback
   - order tracking and status history
   - cancellation according to backend rules
   - completed-order rating
   - order history
   - notifications
   - error/loading/empty states
5. Improve the provider UI:
   - login
   - provider profile
   - verification status/documents
   - online/offline
   - real offers from API
   - accept/reject
   - real status progression
   - earnings
   - services/areas/availability management
6. Improve the admin UI:
   - dashboard statistics from `/admin/dashboard`
   - users
   - providers
   - verification approve/reject/suspend
   - orders and filters
   - complaints and actions
   - areas
   - settings
   - audit logs
7. Do not create fake buttons, fake statistics, fake login, or static demo dashboards.
8. Every form that is presented as working must call the real API and persist to the database.
9. Keep the UI mobile-first and installable/PWA-ready. If adding a manifest/service worker, do it cleanly without introducing unnecessary dependencies.
10. Preserve the existing security model: JWT bearer auth, server-side validation, authorization middleware, rate limiting, no plaintext passwords.
11. Keep the map abstraction. Leaflet + OpenStreetMap is acceptable for MVP.
12. Keep Arabic RTL and English-ready structure.
13. Run at minimum:
    - `tsc -p tsconfig.build.json`
    - `tsc -p web.tsconfig.json`
    - `npm test` when dependencies are available
    - start the server and verify `/health`, `/`, `/provider.html`, `/admin`
14. Run `npm run seed:demo` in development if a clean database is needed. Do not use demo seed in production.
15. Update `PROGRESS.md` after each meaningful checkpoint so a future Claude session can resume without repeating work.
16. At the end, report exactly:
    - files created/changed
    - features completed
    - tests/typecheck results
    - known limitations
    - exact next checkpoint

## Critical rule
If the free-session quota ends, leave the project in a resumable state and update `PROGRESS.md`. On the next session, continue from the files already present. Do not rebuild from zero.
