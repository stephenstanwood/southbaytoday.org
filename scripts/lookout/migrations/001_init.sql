-- Newsletter tracker schema. Replaces the single-blob JSON store that
-- repeatedly got wiped by read/modify/write races. Postgres gives us per-row
-- updates, soft delete, and a real audit trail.

CREATE TABLE IF NOT EXISTS newsletter_targets (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  signup_url          TEXT NOT NULL,
  city                TEXT,
  category            TEXT NOT NULL,
  provider            TEXT NOT NULL,
  priority            SMALLINT NOT NULL,
  notes               TEXT,
  status              TEXT NOT NULL,
  attempted_at        TIMESTAMPTZ,
  confirmed_at        TIMESTAMPTZ,
  last_received_at    TIMESTAMPTZ,
  received_count      INTEGER NOT NULL DEFAULT 0,
  seen_from_addresses TEXT[] NOT NULL DEFAULT '{}',
  seen_from_domains   TEXT[] NOT NULL DEFAULT '{}',
  seen_message_ids    TEXT[] NOT NULL DEFAULT '{}',
  last_error          TEXT,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_targets_live
  ON newsletter_targets(category) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_targets_seen_addresses
  ON newsletter_targets USING GIN (seen_from_addresses);

CREATE INDEX IF NOT EXISTS idx_targets_seen_domains
  ON newsletter_targets USING GIN (seen_from_domains);

CREATE TABLE IF NOT EXISTS tracker_audit (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  action       TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  details      JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_target
  ON tracker_audit(target_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_at
  ON tracker_audit(at DESC);
