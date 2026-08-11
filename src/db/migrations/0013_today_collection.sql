ALTER TABLE jobs ADD COLUMN posting_date_evidence TEXT;
ALTER TABLE jobs ADD COLUMN posting_date_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (posting_date_status IN ('today', 'older', 'future_invalid', 'unknown'));
ALTER TABLE jobs ADD COLUMN posting_date_local_date TEXT;

ALTER TABLE job_provenance_history ADD COLUMN posting_date_evidence TEXT;
ALTER TABLE job_provenance_history ADD COLUMN posting_date_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (posting_date_status IN ('today', 'older', 'future_invalid', 'unknown'));
ALTER TABLE job_provenance_history ADD COLUMN posting_date_local_date TEXT;

ALTER TABLE ingestion_runs ADD COLUMN collection_date_scope TEXT NOT NULL DEFAULT 'all'
  CHECK (collection_date_scope IN ('all', 'today'));
ALTER TABLE ingestion_runs ADD COLUMN collection_timezone TEXT;
ALTER TABLE ingestion_runs ADD COLUMN collection_local_date TEXT;
ALTER TABLE ingestion_runs ADD COLUMN posting_today_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN posting_older_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN posting_unknown_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN posting_future_invalid_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN source_failure_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_jobs_posting_date_scope ON jobs(posting_date_status, posting_date_local_date);
CREATE INDEX idx_ingestion_runs_collection_date ON ingestion_runs(collection_date_scope, collection_local_date);
