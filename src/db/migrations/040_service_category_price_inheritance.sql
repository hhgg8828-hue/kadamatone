ALTER TABLE services ADD COLUMN uses_category_default INTEGER NOT NULL DEFAULT 0 CHECK (uses_category_default IN (0,1));
