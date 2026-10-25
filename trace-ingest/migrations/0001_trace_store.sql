-- Kallo's AI meal traces, moved out of Supabase (2026-10-25).
--
-- trace_events holds every kallo_trace_v1 line Kallo emits, exactly as it was
-- written to Cloud Logging, so one parser reads both stores. Lines carry no
-- user id (Kallo filters them before emitting). Kept 14 days.
CREATE TABLE trace_events (
  request_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('request', 'stage', 'llm', 'final')),
  -- Kallo's clock when the line was emitted, as toISOString() writes it (so
  -- text order is time order). Retention runs on it; the ingest Worker clamps
  -- it to the last 15 days, so a bad clock cannot keep a row past retention.
  emitted_at TEXT NOT NULL,
  -- The Worker's clock (Unix ms), to see how late a send arrived.
  received_at INTEGER NOT NULL,
  body TEXT NOT NULL,
  UNIQUE (request_id, event_id, part)
);
CREATE INDEX trace_events_emitted_idx ON trace_events (emitted_at);

-- One row per ingredient verdict, joined to the candidate pool matching
-- emitted: the D1 port of analytics.v_verdict_pool + v_ingredient_decisions.
-- Derived at ingest once a request's matching and assembly stages have both
-- arrived, with the same bounds and label checks as the Postgres view. Small
-- rows, so they outlive the raw traces: kept 30 days.
CREATE TABLE ingredient_decisions (
  request_id TEXT NOT NULL,
  gidx INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  ingredient_query TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'unmatched', 'rejected', 'missing')),
  pool_size INTEGER NOT NULL,
  selected_rank INTEGER,
  reject_bucket TEXT,
  candidate_1_food_id TEXT, candidate_1_name TEXT, candidate_1_source TEXT, candidate_1_similarity REAL,
  candidate_2_food_id TEXT, candidate_2_name TEXT, candidate_2_source TEXT, candidate_2_similarity REAL,
  candidate_3_food_id TEXT, candidate_3_name TEXT, candidate_3_source TEXT, candidate_3_similarity REAL,
  chosen_food_id TEXT, chosen_name TEXT, chosen_source TEXT, chosen_similarity REAL,
  PRIMARY KEY (request_id, gidx)
);
CREATE INDEX ingredient_decisions_occurred_idx ON ingredient_decisions (occurred_at);
