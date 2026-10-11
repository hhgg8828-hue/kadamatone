# V83.7 — Authorization audit

## Findings addressed
- A provider whose offer was rejected, expired, or withdrawn could still read an order through historical `order_assignments` rows.
- The same historical-row check was present in task/timeline authorization.
- A provider with a live offer could update execution task status before accepting/being assigned the order.

## Changes
- Order detail participation now requires a current `OFFERED` or `ACCEPTED` assignment unless the provider is the order's current provider.
- Task/timeline authorization follows the same current-assignment rule.
- Task mutations are rejected until the provider is actually assigned to the order.
- Cancellation by a provider against another provider's order retains the explicit forbidden response.
- PWA asset and service-worker cache versions advanced to V83.7.

## Verification
- TypeScript/application build succeeded.
- Full automated suite: 267 tests passed, 0 failed.
- Focused regression run for order lifecycle, cancellation, and V83.7 authorization: 19 tests passed, 0 failed.
- ZIP archive integrity checked after packaging.

## Scope note
Automated tests verify the implemented authorization paths; they do not replace a production environment security review or device-level testing.
