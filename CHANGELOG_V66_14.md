# V66.14 — messaging reliability, provider capabilities, vehicles, discovery and profile

## Implemented

- Provider capabilities now use a compact dropdown editor with previously saved capabilities preselected. Only selected capabilities remain visible after saving.
- Vehicle approval UI now calls the existing backend route `/admin/vehicles/:id/verification` correctly. The legacy `/verify` route remains for compatibility.
- Customer/provider order chat remains one order-linked conversation and now handles direct `chat_message` realtime events in addition to the existing notification/SSE path.
- Chat message timestamps are made monotonic per order so rapid messages retain their send order even when the system clock returns the same millisecond.
- Text/location messages receive a client-side outbox for offline/retry behavior. The server continues to use `Idempotency-Key` to prevent duplicate delivery.
- Complaint replies now also support `Idempotency-Key`; admin complaint conversations receive realtime events when customers/providers reply.
- Customer complaint and admin complaint threads update in place instead of reopening/replacing the modal, so a draft being typed is not lost when a new message arrives.
- Customer "Send location" validates coordinates before sending and uses the existing order-message location payload/schema.
- Customer order loading now paginates through all available pages and no longer hides cancelled orders.
- Quick service discovery is horizontally scrollable with an explicit "عرض المزيد" expansion for large catalogs.
- Temporary service/campaign actions support real SERVICE/ORDER/TRIP/INTERNAL/URL flows instead of leaving the action button inert.
- Provider notification workspace shows the latest 5 notifications; the full notification center remains available.
- Provider account now supports avatar upload through the existing file service, persists the avatar on the user account, and displays it in the provider dashboard/public provider profile.
- Cache-busting updated to V66.14.

## Data safety

- No database reset or destructive replacement.
- Existing order chat data is preserved.
- Added one non-destructive migration for complaint-message idempotency.

## Validation

- `npm run build` passes.
- Full test suite passes: **221/221** tests, **0 failures**.
- Added V66.14 tests covering capabilities, vehicle approval, bidirectional chat, location messages, duplicate prevention, message ordering under identical timestamps, complaint realtime/idempotency, and current UI wiring.
