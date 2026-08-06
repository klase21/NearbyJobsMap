ALTER TABLE ingestion_runs ADD COLUMN exclusion_keywords_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ingestion_runs ADD COLUMN exclusion_fields_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ingestion_runs ADD COLUMN exclusion_config_hash TEXT;
ALTER TABLE ingestion_runs ADD COLUMN excluded_candidate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN selected_candidate_count_after_exclusion INTEGER NOT NULL DEFAULT 0;
