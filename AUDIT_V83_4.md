# Operational audit — V83.4

## Fixed
- Live location updates are rejected when a provider is offline and has no active assigned order. This prevents a stale/offline session from rewriting the last known live position.
- Location updates remain permitted for an active assigned trip, allowing customer tracking to continue during a transient presence-state drop.
- Added regression coverage for the offline location-write boundary and for unassigned providers attempting to open an order.
- Updated all cache-busting assertions and service-worker expectations to the V83.4 asset version.

## Verification
- `npm run build`: passed.
- `node --test --test-concurrency=1 "dist/test/**/*.test.js"`: 261 tests passed, 0 failed.

## Scope note
This is an automated code/API audit. It does not replace real-device testing of GPS permissions, background execution, map rendering, or production routing configuration.
