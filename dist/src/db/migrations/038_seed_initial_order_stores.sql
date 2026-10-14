-- Initial editable store suggestions requested by the app owner.
-- Keep inactive until the administrator chooses which stores to publish to customers.
INSERT OR IGNORE INTO order_store_recommendations
  (id, store_name, category_name, description, featured_items, delivery_fee, minimum_order, image_url, is_active, sort_order, created_by, created_at, updated_at)
VALUES
  ('seed-store-alhaytham', 'متجر الهيثم', 'متاجر عامة', 'متجر تجريبي أولي قابل للتعديل من لوحة التحكم.', '', 0, 0, NULL, 0, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-store-alsaada', 'متجر السعادة', 'متاجر عامة', 'متجر تجريبي أولي قابل للتعديل من لوحة التحكم.', '', 0, 0, NULL, 0, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-store-high-class', 'متجر هاي كلاس', 'متاجر عامة', 'متجر تجريبي أولي قابل للتعديل من لوحة التحكم.', '', 0, 0, NULL, 0, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-store-programmer', 'متجر المبرمج للبرمجيات', 'متاجر عامة', 'متجر تجريبي أولي قابل للتعديل من لوحة التحكم.', '', 0, 0, NULL, 0, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
