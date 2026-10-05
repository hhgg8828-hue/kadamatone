# V66.11

- Provider Presence now stores heartbeat and location timestamps separately.
- Online, availability and accepting-orders are independent operational states.
- Matching requires accepting_orders=1 in addition to existing verification/online gates.
- Admin live monitoring includes all verified providers, heartbeat/location timestamps and current order.
- Order execution events push admin SSE synchronization.
- Motorcycle trip destination is optional at creation; destination can be supplied later through `/trips/:id/destination`.
- Existing data is preserved through additive migration 023.

- Native share sheet is used for live trip location and trip sharing when supported, with clipboard fallback.
- Admin SSE receives provider location changes for live monitoring.
- Chat, complaint replies and ratings are recorded in the order execution timeline.
