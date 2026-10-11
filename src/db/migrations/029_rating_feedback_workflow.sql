-- V85.0: structured service/provider feedback and accountable follow-up.
CREATE TABLE rating_details (
  rating_id TEXT PRIMARY KEY REFERENCES ratings(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  other_note TEXT,
  followup_status TEXT NOT NULL DEFAULT 'NEW' CHECK (followup_status IN ('NEW','IN_REVIEW','RESOLVED')),
  followup_note TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_rating_details_followup ON rating_details(followup_status, created_at DESC);
CREATE INDEX ix_rating_details_service ON rating_details(service_id, created_at DESC);

CREATE TABLE order_service_ratings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('LIKE','DISLIKE')),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_order_service_ratings_service ON order_service_ratings(service_id, sentiment, created_at DESC);
