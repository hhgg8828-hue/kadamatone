# خدمات — V7

## Session and authentication
- Keep the authenticated client session in `sessionStorage` so normal page reloads and in-tab navigation keep the user signed in.
- Do not use `localStorage` for authentication tokens.
- Logout explicitly removes the session state and revokes the server refresh-token family.
- If an access token expires during the active browser session, the client attempts a secure refresh using the existing HttpOnly refresh cookie and CSRF header, then retries once.
- Registration now saves the returned session before redirecting to the customer home page, so a newly registered customer is not sent back to login.

## Browser autofill and suggestions
- Restore normal browser autofill/autocomplete behavior for name, phone, email, username, and password fields.
- Removed the JavaScript that forcibly cleared non-password auth fields and interfered with browser autofill/suggestions.
- Service search suggestions remain fully enabled and continue to come from the dynamic service catalog/API.

## Previously requested behavior retained
- Cancelled customer orders remain hidden from the active "طلباتي" list.
- Arabic order-status labels.
- 12-hour Arabic date/time display with صباحًا/مساءً.
- Current-location button using browser Geolocation API.
- Dynamic service/category search and order forms.
