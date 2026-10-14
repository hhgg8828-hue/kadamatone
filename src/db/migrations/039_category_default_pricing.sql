ALTER TABLE categories ADD COLUMN default_pricing_type TEXT NOT NULL DEFAULT 'QUOTE' CHECK(default_pricing_type IN ('FIXED','QUOTE'));
ALTER TABLE categories ADD COLUMN default_base_price REAL CHECK(default_base_price IS NULL OR default_base_price >= 0);
UPDATE categories SET default_pricing_type='QUOTE', default_base_price=NULL;
