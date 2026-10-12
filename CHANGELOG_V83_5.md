# V83.5 — Final trip fare and settlement integrity

## Fixed
- Recalculate motorcycle-trip fare from recorded GPS points before transitioning the order to `COMPLETED`.
- Refresh the order after changing its final fare so optimistic version checks remain valid.
- Calculate platform commission and provider payout from the final fare rather than the pre-trip estimate.
- Update the pending cash payment amount to the final agreed price when marking it paid.
- Added regression assertions for final fare, commission, provider payout, and payment amount/status.
- Bumped frontend asset query versions and service-worker cache to V83.5.

## Verification scope
Automated build and test results are recorded after running the release checks. GPS/route accuracy and payment behavior still require real-device and production acceptance testing.
