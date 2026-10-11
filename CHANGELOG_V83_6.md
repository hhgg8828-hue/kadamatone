# V83.6 — Order-scoped live tracking privacy

- Live provider coordinates are returned for an order only while that specific order is active (`ACCEPTED`, `ON_THE_WAY`, or `IN_PROGRESS`).
- Live coordinates older than two minutes, or implausibly future-dated, are treated as unavailable rather than shown as current.
- Applied the same rule to authenticated order tracking, public share pages, and shared-route generation so a completed order cannot display a provider's location from a later job.
- Historical GPS points remain available for the shared order history.
- Updated PWA asset versions and service-worker cache key.
- Added regression tests for order-scoped location visibility and cache versioning.
