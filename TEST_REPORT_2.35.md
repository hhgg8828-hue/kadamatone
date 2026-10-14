# Test Report — Khadamat 2.35

- Build: PASS (`npm run build`)
- Test files: 77
- Total tests: 389
- Passed: 389
- Failed: 0
- Timed out / runner errors: 0

## Added regression coverage
- A new order triggers `NEW_ORDER_CONFIRMATION_ADMIN` for the administration account.
- The admin confirmation queue exposes the new order and a usable customer phone number.
- Existing order-confirmation UI provides a click-to-call link and status recording (confirmed, unreachable, needs review, return to pending).

## Scope note
The system notifies active admin accounts inside the app (and through existing push delivery where enabled). The call is initiated manually by an administrator using the device dialer; the app does not place an automated phone call.
