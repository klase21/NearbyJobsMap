ALTER TABLE jobs ADD COLUMN provenance_kind TEXT NOT NULL DEFAULT 'fixture_derived'
  CHECK (provenance_kind IN ('fixture_derived', 'fictional_demo', 'live_one_shot_observation'));
ALTER TABLE jobs ADD COLUMN permission_status TEXT CHECK (permission_status IS NULL OR permission_status IN ('unverified', 'blocked'));
ALTER TABLE jobs ADD COLUMN provenance_evidence_type TEXT NOT NULL DEFAULT 'observed_html'
  CHECK (provenance_evidence_type IN ('observed_html', 'observed_json_ld', 'observed_internal_json', 'fictional_demo', 'public_page_observation'));
ALTER TABLE jobs ADD COLUMN provenance_listing_url TEXT;
ALTER TABLE jobs ADD COLUMN provenance_detail_url TEXT;
ALTER TABLE jobs ADD COLUMN observed_at TEXT;
ALTER TABLE jobs ADD COLUMN sanitizer_version TEXT;
ALTER TABLE jobs ADD COLUMN parser_version TEXT;
UPDATE jobs SET provenance_kind = record_kind;
UPDATE jobs SET provenance_evidence_type = evidence_type;

CREATE TABLE job_provenance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('fixture_derived', 'fictional_demo', 'live_one_shot_observation')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('observed_html', 'observed_json_ld', 'observed_internal_json', 'fictional_demo', 'public_page_observation')),
  source_reference TEXT NOT NULL,
  permission_status TEXT CHECK (permission_status IS NULL OR permission_status IN ('unverified', 'blocked')),
  listing_url TEXT,
  detail_url TEXT,
  observed_at TEXT,
  sanitizer_version TEXT,
  parser_version TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (job_id, provenance_kind, source_reference)
);
CREATE INDEX idx_job_provenance_history_job ON job_provenance_history(job_id);
INSERT INTO job_provenance_history
  (job_id, provenance_kind, evidence_type, source_reference, first_seen_at, last_seen_at)
SELECT id, record_kind, evidence_type, source_fixture_reference, created_at, updated_at FROM jobs;

CREATE TABLE ingestion_runs_v2 (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'mixed', 'local_demo')),
  ingestion_type TEXT NOT NULL CHECK (ingestion_type IN ('sanitized_fixture', 'fictional_demo_seed', 'jobkorea_one_shot_transport')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed', 'blocked')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  input_record_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  permission_status TEXT CHECK (permission_status IS NULL OR permission_status IN ('unverified', 'blocked')),
  listing_url TEXT,
  max_details INTEGER,
  content_request_limit INTEGER,
  preflight_request_limit INTEGER,
  content_request_count INTEGER NOT NULL DEFAULT 0,
  preflight_request_count INTEGER NOT NULL DEFAULT 0,
  selected_detail_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 0 CHECK (dry_run IN (0, 1)),
  created_at TEXT NOT NULL
);
INSERT INTO ingestion_runs_v2
  (id, source, ingestion_type, status, started_at, completed_at, input_record_count, inserted_count, updated_count,
   unchanged_count, skipped_count, failed_count, error_summary, created_at)
SELECT id, source, ingestion_type, status, started_at, completed_at, input_record_count, inserted_count, updated_count,
       unchanged_count, skipped_count, failed_count, error_summary, created_at
FROM ingestion_runs;

CREATE TABLE ingestion_items_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingestion_run_id TEXT NOT NULL REFERENCES ingestion_runs_v2(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'work24')),
  source_posting_id TEXT,
  canonical_job_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('inserted', 'updated', 'unchanged', 'skipped', 'failed')),
  diagnostic_codes TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO ingestion_items_v2 SELECT * FROM ingestion_items;
DROP TABLE ingestion_items;
DROP TABLE ingestion_runs;
ALTER TABLE ingestion_runs_v2 RENAME TO ingestion_runs;
ALTER TABLE ingestion_items_v2 RENAME TO ingestion_items;
CREATE INDEX idx_ingestion_items_run ON ingestion_items(ingestion_run_id);
CREATE INDEX idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);
