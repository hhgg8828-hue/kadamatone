-- V66.11: separate provider connectivity, heartbeat, location freshness and order intake state.
ALTER TABLE service_providers ADD COLUMN accepting_orders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE service_providers ADD COLUMN last_heartbeat_at TEXT;
ALTER TABLE service_providers ADD COLUMN last_location_at TEXT;
CREATE INDEX IF NOT EXISTS ix_providers_presence_state ON service_providers(verification_status,is_online,accepting_orders,last_heartbeat_at);
UPDATE service_providers SET accepting_orders = CASE WHEN is_online=1 THEN 1 ELSE accepting_orders END WHERE accepting_orders IS NULL;
