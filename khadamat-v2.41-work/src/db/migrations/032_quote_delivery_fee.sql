-- V85.1: make the delivery/travel fee explicit in provider quotes.
ALTER TABLE quotes ADD COLUMN delivery_fee REAL NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0 AND delivery_fee <= 100000000);
