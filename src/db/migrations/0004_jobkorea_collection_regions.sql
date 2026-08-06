ALTER TABLE jobs ADD COLUMN collection_preset_id TEXT;
ALTER TABLE jobs ADD COLUMN collection_preset_label TEXT;
ALTER TABLE jobs ADD COLUMN collection_keyword TEXT;
ALTER TABLE jobs ADD COLUMN requested_regions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN normalized_regions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN region_normalization_confidence TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE jobs ADD COLUMN detail_access_status TEXT;
ALTER TABLE jobs ADD COLUMN observed_link_count INTEGER;

ALTER TABLE job_provenance_history ADD COLUMN collection_preset_id TEXT;
ALTER TABLE job_provenance_history ADD COLUMN collection_preset_label TEXT;
ALTER TABLE job_provenance_history ADD COLUMN collection_keyword TEXT;
ALTER TABLE job_provenance_history ADD COLUMN requested_regions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE job_provenance_history ADD COLUMN normalized_regions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE job_provenance_history ADD COLUMN region_normalization_confidence TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE job_provenance_history ADD COLUMN detail_access_status TEXT;
ALTER TABLE job_provenance_history ADD COLUMN observed_link_count INTEGER;
