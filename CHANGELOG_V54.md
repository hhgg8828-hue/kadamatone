# V54 — Admin team management + responsive admin UI

- Secure admin self-service for email/password changes with current-password verification, token invalidation, and new session issuance.
- Super Admin-only management of additional ADMIN/SUPPORT accounts: create, edit, password reset, activate/suspend.
- Protected SUPER_ADMIN from modification by another admin.
- Audit logging for administrative account changes.
- Responsive horizontal scrolling containers for admin orders, areas, users, and audit tables so the page itself does not shift horizontally.
- Polished administrator cards and mobile layout.

- Preserved the requested initial admin fallback credentials for fresh databases; existing admin records are not overwritten by startup seed.
