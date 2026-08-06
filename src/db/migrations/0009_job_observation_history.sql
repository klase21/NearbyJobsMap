CREATE TABLE job_observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 observation_key TEXT NOT NULL UNIQUE,
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 ingestion_run_id TEXT REFERENCES ingestion_runs(id) ON DELETE SET NULL,
 source TEXT NOT NULL,
 source_posting_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 completeness TEXT NOT NULL CHECK(completeness IN ('listing_only','detail_complete','unknown')),
 posting_status TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 observation_kind TEXT NOT NULL CHECK(observation_kind IN ('baseline_backfill','ingestion'))
);
CREATE INDEX idx_job_observations_job_time ON job_observations(job_id,observed_at DESC);
CREATE TABLE job_change_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 observation_id INTEGER NOT NULL REFERENCES job_observations(id) ON DELETE CASCADE,
 changed_at TEXT NOT NULL,
 changed_fields_json TEXT NOT NULL,
 changes_json TEXT NOT NULL,
 UNIQUE(job_id,observation_id)
);
INSERT INTO job_observations(observation_key,job_id,ingestion_run_id,source,source_posting_id,observed_at,content_hash,completeness,posting_status,snapshot_json,observation_kind)
SELECT 'baseline:'||id,id,NULL,source,source_posting_id,COALESCE(observed_at,last_verified_at,collected_at,created_at),content_hash,
 CASE WHEN observation_kind='bounded_manual_collection' THEN 'detail_complete' WHEN observation_kind='bounded_listing_collection' THEN 'listing_only' ELSE 'unknown' END,
 posting_status,json_object('title',title,'company',company_name,'location',address_original_text,'salary',salary_original_text,'employmentTypes',json('[]'),'deadline',expires_at,'postingStatus',posting_status,'completeness',CASE WHEN observation_kind='bounded_manual_collection' THEN 'detail_complete' WHEN observation_kind='bounded_listing_collection' THEN 'listing_only' ELSE 'unknown' END,'sourceUrl',COALESCE(canonical_url,source_url)),'baseline_backfill' FROM jobs;
