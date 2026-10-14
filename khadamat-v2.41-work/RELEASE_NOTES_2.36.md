# Khadamat V2.36

## Implemented from the latest user reference screens
- Reworked pharmacy requests into a multi-product cart. Each product has a name/description, quantity starting at 1, increment/decrement controls, delete action, and optional image.
- Added a product list to the confirmation step and a way to add another product before submitting.
- Product images are uploaded as order attachments when the order is submitted online.
- Added paired “from address” and “to address” controls for the trip/delivery flow, with a bottom sheet offering saved addresses or map selection, plus a swap-address control.
- Added immediate/later scheduling for trip requests and persisted the chosen future time on the order.
- Kept the existing order chat action and made the order status timeline visible in customer order tracking.
- Updated web asset and service-worker cache versions to 2.36.

## Validation
- TypeScript production build passed.
- Full test suite: 394 tests across 78 test files; all passed.
- This is code/test validation only; the updated UI has not been manually exercised on a production deployment or physical device.
