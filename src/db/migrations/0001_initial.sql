CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'work24')),
  source_posting_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  normalized_company_name TEXT,
  description_summary TEXT,
  experience_requirement TEXT,
  education_requirement TEXT,
  salary_original_text TEXT NOT NULL,
  salary_type TEXT NOT NULL CHECK (salary_type IN ('hourly', 'daily', 'weekly', 'monthly', 'annual', 'per_task', 'negotiable', 'company_policy', 'mixed', 'unknown')),
  salary_minimum_amount REAL,
  salary_maximum_amount REAL,
  salary_currency TEXT CHECK (salary_currency IS NULL OR salary_currency = 'KRW'),
  salary_negotiable INTEGER NOT NULL CHECK (salary_negotiable IN (0, 1)),
  salary_includes_incentive INTEGER CHECK (salary_includes_incentive IS NULL OR salary_includes_incentive IN (0, 1)),
  salary_normalized_monthly_minimum REAL,
  salary_normalized_monthly_maximum REAL,
  salary_normalization_basis TEXT,
  salary_normalization_confidence TEXT CHECK (salary_normalization_confidence IS NULL OR salary_normalization_confidence IN ('high', 'medium', 'low')),
  address_original_text TEXT,
  road_address TEXT,
  parcel_address TEXT,
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  nearest_station TEXT,
  latitude REAL,
  longitude REAL,
  location_accuracy TEXT NOT NULL CHECK (location_accuracy IN ('exact_coordinate', 'exact_address', 'neighborhood', 'district', 'city', 'station_area', 'multiple_locations', 'headquarters_only', 'location_undecided', 'unavailable')),
  workplace_count INTEGER CHECK (workplace_count IS NULL OR workplace_count >= 0),
  work_days_original_text TEXT,
  work_start_time TEXT,
  work_end_time TEXT,
  shift_type TEXT,
  posted_at TEXT,
  modified_at TEXT,
  expires_at TEXT,
  posting_status TEXT NOT NULL CHECK (posting_status IN ('active', 'closing_soon', 'expired', 'closed', 'removed', 'unknown')),
  promoted INTEGER CHECK (promoted IS NULL OR promoted IN (0, 1)),
  remote INTEGER CHECK (remote IS NULL OR remote IN (0, 1)),
  collected_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  raw_payload_reference TEXT,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('fixture_derived', 'fictional_demo')),
  is_fictional INTEGER NOT NULL CHECK (is_fictional IN (0, 1)),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('observed_html', 'observed_json_ld', 'observed_internal_json', 'fictional_demo')),
  source_fixture_reference TEXT NOT NULL,
  display_map_latitude REAL,
  display_map_longitude REAL,
  display_map_kind TEXT CHECK (display_map_kind IS NULL OR display_map_kind IN ('exact', 'estimated')),
  display_map_provenance TEXT CHECK (display_map_provenance IS NULL OR display_map_provenance IN ('source', 'fictional_demo')),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((source_posting_id <> '') OR canonical_url IS NOT NULL),
  CHECK ((display_map_latitude IS NULL AND display_map_longitude IS NULL AND display_map_kind IS NULL AND display_map_provenance IS NULL)
      OR (display_map_latitude IS NOT NULL AND display_map_longitude IS NOT NULL AND display_map_kind IS NOT NULL AND display_map_provenance IS NOT NULL))
);

CREATE UNIQUE INDEX uq_jobs_source_posting_id
  ON jobs(source, source_posting_id) WHERE source_posting_id <> '';
CREATE UNIQUE INDEX uq_jobs_source_canonical_url_fallback
  ON jobs(source, canonical_url) WHERE source_posting_id = '' AND canonical_url IS NOT NULL;
CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_record_kind ON jobs(record_kind);

CREATE TABLE job_categories (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (job_id, position)
);

CREATE TABLE job_employment_types (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employment_type TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (job_id, position)
);

CREATE TABLE workplaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  original_text TEXT NOT NULL,
  road_address TEXT,
  parcel_address TEXT,
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  nearest_station TEXT,
  latitude REAL,
  longitude REAL,
  accuracy TEXT NOT NULL CHECK (accuracy IN ('exact_coordinate', 'exact_address', 'neighborhood', 'district', 'city', 'station_area', 'multiple_locations', 'headquarters_only', 'location_undecided', 'unavailable')),
  is_headquarters_only INTEGER NOT NULL CHECK (is_headquarters_only IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (job_id, position)
);
CREATE INDEX idx_workplaces_job_id ON workplaces(job_id);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'mixed', 'local_demo')),
  ingestion_type TEXT NOT NULL CHECK (ingestion_type IN ('sanitized_fixture', 'fictional_demo_seed')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  input_record_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ingestion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingestion_run_id TEXT NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon', 'work24')),
  source_posting_id TEXT,
  canonical_job_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('inserted', 'updated', 'unchanged', 'skipped', 'failed')),
  diagnostic_codes TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ingestion_items_run ON ingestion_items(ingestion_run_id);
CREATE INDEX idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);
