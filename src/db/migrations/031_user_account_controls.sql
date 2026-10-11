-- V85.1: optional secondary contact number for user accounts.
ALTER TABLE users ADD COLUMN secondary_phone TEXT;
CREATE INDEX IF NOT EXISTS ix_users_secondary_phone ON users(secondary_phone) WHERE secondary_phone IS NOT NULL;
