-- V2.82: allow the admin to schedule a callback when a customer cannot be reached.
-- Rebuild the small queue table to add SCHEDULED without losing existing outcomes.
CREATE TABLE order_contact_confirmations_new (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','UNREACHABLE','NEEDS_REVIEW','NOT_REQUIRED','SCHEDULED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_note TEXT,
  attempted_by TEXT REFERENCES users(id),
  attempted_at TEXT,
  confirmed_at TEXT,
  follow_up_at TEXT,
  follow_up_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO order_contact_confirmations_new(order_id,status,attempt_count,result_note,attempted_by,attempted_at,confirmed_at,created_at,updated_at)
SELECT order_id,status,attempt_count,result_note,attempted_by,attempted_at,confirmed_at,created_at,updated_at
FROM order_contact_confirmations;
DROP TABLE order_contact_confirmations;
ALTER TABLE order_contact_confirmations_new RENAME TO order_contact_confirmations;
CREATE INDEX ix_order_contact_confirmations_status ON order_contact_confirmations(status, created_at DESC);
CREATE INDEX ix_order_contact_confirmations_follow_up ON order_contact_confirmations(status, follow_up_at);
