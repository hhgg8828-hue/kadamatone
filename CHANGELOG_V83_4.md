# Khadamat V83.4 — Privacy and tracking reliability

- Prevented providers who are offline and have no active assigned trip from updating their live location.
- Preserved location updates for an active assigned trip, even if the provider presence flag temporarily drops, so customer trip tracking can continue.
- Added regression tests for offline location writes and unassigned order access.
- Bumped static asset and service-worker cache versions to V83.4.
