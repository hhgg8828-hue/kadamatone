CREATE TABLE IF NOT EXISTS order_store_recommendations (
 id TEXT PRIMARY KEY, store_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', featured_items TEXT NOT NULL DEFAULT '', delivery_fee INTEGER NOT NULL DEFAULT 250 CHECK(delivery_fee>=0), minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order>=0), image_url TEXT, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
