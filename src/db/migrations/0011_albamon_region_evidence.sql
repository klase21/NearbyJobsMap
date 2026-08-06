ALTER TABLE jobs ADD COLUMN region_evidence_source TEXT NOT NULL DEFAULT 'unknown'
  CHECK (region_evidence_source IN ('displayed_location', 'mapped_displayed_location', 'source_filter', 'unknown'));
ALTER TABLE jobs ADD COLUMN source_area_code TEXT;
ALTER TABLE jobs ADD COLUMN displayed_location_present INTEGER
  CHECK (displayed_location_present IS NULL OR displayed_location_present IN (0, 1));

ALTER TABLE job_provenance_history ADD COLUMN region_evidence_source TEXT NOT NULL DEFAULT 'unknown'
  CHECK (region_evidence_source IN ('displayed_location', 'mapped_displayed_location', 'source_filter', 'unknown'));
ALTER TABLE job_provenance_history ADD COLUMN source_area_code TEXT;
ALTER TABLE job_provenance_history ADD COLUMN displayed_location_present INTEGER
  CHECK (displayed_location_present IS NULL OR displayed_location_present IN (0, 1));
