ALTER TABLE saved_job_views ADD COLUMN sort_key TEXT NOT NULL DEFAULT 'newest'
  CHECK (sort_key IN ('newest','deadline','distance','monthly_distance','hourly','daily','monthly','annual','normalized_monthly','company'));

ALTER TABLE ingestion_runs ADD COLUMN operation_kind TEXT NOT NULL DEFAULT 'collection'
  CHECK (operation_kind IN ('collection','manual_backfill'));
ALTER TABLE ingestion_runs ADD COLUMN cutoff_date TEXT;
ALTER TABLE ingestion_runs ADD COLUMN pages_scanned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN stop_reason TEXT;
ALTER TABLE ingestion_runs ADD COLUMN oldest_posting_date TEXT;
ALTER TABLE ingestion_runs ADD COLUMN pre_write_backup_file TEXT;

CREATE INDEX idx_ingestion_runs_operation_started ON ingestion_runs(operation_kind, started_at DESC);
