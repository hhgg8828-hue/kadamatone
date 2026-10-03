# V56 — Realtime synchronization and admin responsive polish

- Added a generic SSE `sync` event for connected sessions so changes can refresh open customer/provider/admin views automatically.
- Provider and customer profile/address mutations notify the same account's other open sessions.
- Catalog/settings/area changes broadcast synchronization to connected sessions.
- Preserved V55 About the App, V54 admin account/team management, chat, notifications, and provider online readiness rules.
- Strengthened admin visual hierarchy and strict mobile viewport containment while keeping table scrolling inside table containers.
- Version bumped to 0.5.10.
