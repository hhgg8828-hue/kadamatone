# Khadamat — V53 Base + Requested Updates

This release keeps V53 as the functional/UI baseline and layers the requested operational additions on top.

- V53 remains the baseline; no wholesale redesign.
- Admin team/account management retained.
- About-app content retained.
- Realtime sync and responsive admin behavior retained.
- Motorcycle trip module added with routing support.
- Trip migration is included and startup migrations/seed run automatically.
- Railway build/start commands are explicit: `npm run build` then `npm start`.
- `seed:demo` is not used for production startup.
- Secrets such as JWT_SECRET must remain Railway environment variables.
