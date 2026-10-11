# Privacy and tracking audit — V83.6

## Issue addressed
The previous tracking endpoints read the provider's global latest coordinate even when viewing a completed/cancelled order. If that provider later accepted another job, an old order or still-valid share link could reveal the provider's location from the unrelated job. Old coordinates could also be presented as live indefinitely.

## Changes
- Added one shared guard that returns live coordinates only for the order's active lifecycle states.
- Treats coordinates older than 120 seconds or more than 30 seconds in the future as unavailable.
- Uses the guard for authenticated tracking, public share details, and shared route generation.
- Keeps historical GPS points associated with the original order, without presenting them as current location.

## Scope
Automated tests verify source-level invariants and the build. Real device GPS/background and production map routing still require deployment-level testing.
