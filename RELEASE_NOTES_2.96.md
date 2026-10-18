# Khadamat v2.96 — App icon integration

- Integrated the green-and-gold 3D “H / خدمات الهيثم” brand artwork into the actual installable app icon assets.
- Updated standard, customer, provider, and admin launcher icons (192×192 and 512×512) and favicon.
- Kept download arrows out of the brand icon.
- Updated PWA manifest theme/background colors and cache-busting version references.
- Kept the existing separate customer/provider/admin manifest paths and their app start URLs/scopes.

## Deployment
Upload this project version to the GitHub repository connected to Railway and allow deployment to finish. Then reopen the app URL and reinstall/add it to the home screen. Browsers may cache an already-installed PWA icon, so removing the old home-screen shortcut and reinstalling may be needed to see the updated icon.

## Validation scope
Verified manifest references and icon asset dimensions/files locally. A full build/runtime test was not run in this workspace because dependencies are not installed here.
