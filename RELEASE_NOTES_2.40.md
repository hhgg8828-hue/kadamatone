# خدمات v2.40

## Changes
- Replaced the text-heavy checkout store recommendation rows with compact, horizontally aligned store tiles using circular images; stores without an image display a circular initial placeholder.
- Updated the admin store list to preview store images in circular form and clarified the image URL field.
- Changed checkout payment UI to a dropdown with cash available and wallet/app balance options visible but disabled until real payment integration exists. No fake wallet or balance payment is processed.
- Improved the admin order detail modal with a structured two-column details table sourced from saved order form data, payment method, and actual saved price fields when present.

## Verification
- `npm run build`: passed.
- Focused tests: `v2_32_order_checkout_reference.test.js` (4/4), `admin-operational.test.js` (2/2), `final-complete-ui.test.js` (5/5) passed.
- Full `npm test` exceeded the execution time limit before a final suite summary was available; full-suite success is not claimed.
- No real-device visual comparison against every reference screenshot was performed in this run. Therefore this release is not claimed to be pixel-perfect yet.
