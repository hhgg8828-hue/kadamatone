# V81 — Separate installable experiences

- Dedicated customer route `/customer` and page `/customer.html`.
- Customer role canonical home changed to `/customer`.
- Provider and admin remain isolated at `/provider` and `/admin`.
- Added unique PWA manifests for customer, provider, and admin.
- Provider/admin pages now advertise their own installable app identity and register the service worker.
- Direct provider/admin visits without a session show only that role login screen.
- Service-worker cache updated to V81 and includes all three experiences.
- Push fallback opens the customer experience.
- Existing backend/API flows preserved.
- Notification deep links now target the correct isolated role interface, including `/customer` for customers.
