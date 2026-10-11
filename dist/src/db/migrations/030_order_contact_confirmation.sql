-- V85.0: operational callback queue for new orders.
CREATE TABLE order_contact_confirmations (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','UNREACHABLE','NEEDS_REVIEW','NOT_REQUIRED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_note TEXT,
  attempted_by TEXT REFERENCES users(id),
  attempted_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_order_contact_confirmations_status ON order_contact_confirmations(status, created_at DESC);

-- Existing active orders enter the queue once on upgrade; terminal orders do not.
INSERT OR IGNORE INTO order_contact_confirmations(order_id,status,attempt_count,created_at,updated_at)
SELECT id,CASE WHEN status IN ('PENDING','SEARCHING','ASSIGNED','ACCEPTED','ON_THE_WAY','IN_PROGRESS') THEN 'PENDING' ELSE 'NOT_REQUIRED' END,0,created_at,updated_at
FROM orders;
