ALTER TABLE jobs ADD COLUMN observation_kind TEXT;
ALTER TABLE jobs ADD COLUMN observation_transport TEXT CHECK (observation_transport IS NULL OR observation_transport IN ('playwright', 'direct'));
ALTER TABLE jobs ADD COLUMN observation_page_number INTEGER;
ALTER TABLE jobs ADD COLUMN observation_listing_position INTEGER;

ALTER TABLE job_provenance_history ADD COLUMN observation_kind TEXT;
ALTER TABLE job_provenance_history ADD COLUMN observation_transport TEXT CHECK (observation_transport IS NULL OR observation_transport IN ('playwright', 'direct'));
ALTER TABLE job_provenance_history ADD COLUMN page_number INTEGER;
ALTER TABLE job_provenance_history ADD COLUMN listing_position INTEGER;

ALTER TABLE ingestion_runs ADD COLUMN selected_transport TEXT CHECK (selected_transport IS NULL OR selected_transport IN ('playwright', 'direct'));
ALTER TABLE ingestion_runs ADD COLUMN search_page_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN browser_navigation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN detail_navigation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_runs ADD COLUMN direct_request_count INTEGER NOT NULL DEFAULT 0;
