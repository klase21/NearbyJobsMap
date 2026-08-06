CREATE TABLE ingestion_runs_v3 (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'mixed', 'local_demo')),
  ingestion_type TEXT NOT NULL CHECK (ingestion_type IN ('sanitized_fixture', 'fictional_demo_seed', 'jobkorea_one_shot_transport', 'albamon_listing_collection')),
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
  created_at TEXT NOT NULL,
  selected_transport TEXT CHECK (selected_transport IS NULL OR selected_transport IN ('playwright', 'direct')),
  search_page_count INTEGER NOT NULL DEFAULT 0,
  browser_navigation_count INTEGER NOT NULL DEFAULT 0,
  detail_navigation_count INTEGER NOT NULL DEFAULT 0,
  direct_request_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO ingestion_runs_v3 SELECT * FROM ingestion_runs;

CREATE TABLE ingestion_items_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingestion_run_id TEXT NOT NULL REFERENCES ingestion_runs_v3(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'work24')),
  source_posting_id TEXT,
  canonical_job_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('inserted', 'updated', 'unchanged', 'skipped', 'failed')),
  diagnostic_codes TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO ingestion_items_v3 SELECT * FROM ingestion_items;
DROP TABLE ingestion_items;
DROP TABLE ingestion_runs;
ALTER TABLE ingestion_runs_v3 RENAME TO ingestion_runs;
ALTER TABLE ingestion_items_v3 RENAME TO ingestion_items;
CREATE INDEX idx_ingestion_items_run ON ingestion_items(ingestion_run_id);
CREATE INDEX idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);
