-- Remove the inactive placeholder recommendations from the initial demo seed.
-- Real order-category entries are now selected from the live catalog by an administrator.
DELETE FROM order_store_recommendations
WHERE id IN ('seed-store-alhaytham','seed-store-alsaada','seed-store-high-class','seed-store-programmer')
  AND is_active = 0;
