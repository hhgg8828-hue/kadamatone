# V75 — Yemen-first family, accessibility and notification UX

## Implemented
- Added optional accessibility preferences stored locally on the device: larger text/buttons, higher contrast, and reduced motion.
- Added saved beneficiary location capture from the current device location, with locality, landmark and access notes.
- Extended beneficiary API validation to preserve locality/landmark/access details already supported by the locations model.
- Moved live in-app toast notifications away from the top of the page to a bottom, centered stack so they do not cover headings, navigation, or primary actions.
- Bumped the web shell/service-worker cache to V75 to avoid stale V71 assets.
- Updated the package description to reflect the Yemen-first direction.

## Validation
- TypeScript/web build: PASS.
- Focused customer-experience + UI tests: 11/11 PASS.
- Full `npm test` was started with a 300-second limit; it did not finish inside that limit. No full-suite success is claimed.
