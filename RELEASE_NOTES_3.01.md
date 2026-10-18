# Khadamat 3.01 — Saved address flow for motorcycle trips

- The trip address sheet now shows saved addresses and an explicit Add button.
- Choosing Add opens a dedicated map-based saved-address form with map search, address label, optional contact phone, and Save Location.
- Saved locations are sent to the existing `/me/addresses` endpoint and selected for the trip after saving.
- Choosing the map option opens a dedicated “موقعك على الخريطة” modal with search, map, address label, optional contact number, Save Location, and Current Location actions.
- Build completed successfully; existing focused checkout and order-flow tests pass (6/6).
- Manual browser/phone GPS testing is still required.
