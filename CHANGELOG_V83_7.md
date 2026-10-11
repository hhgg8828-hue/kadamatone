# V83.7 — Order access authorization hardening

- Provider order-detail authorization now recognizes only current `OFFERED` or `ACCEPTED` assignments when the provider is not the order's currently assigned provider.
- Execution endpoints (tasks and timeline) apply the same current-assignment rule and return not-found for providers without current access, including previously rejected/expired/withdrawn offers.
- Added regression tests for rejected-provider denial, active-offer access, and current PWA asset versions.
- Bumped app asset/cache version to V83.7 and package version to 0.6.41.
