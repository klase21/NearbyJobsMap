CREATE TABLE saved_collection_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('jobkorea', 'albamon')),
  base_preset_id TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('jobkorea_keyword', 'albamon_today')),
  keyword TEXT,
  requested_regions_json TEXT NOT NULL,
  pages INTEGER NOT NULL CHECK (pages BETWEEN 1 AND 5),
  max_candidates INTEGER NOT NULL CHECK (max_candidates BETWEEN 1 AND 50),
  allow_listing_fallback INTEGER NOT NULL CHECK (allow_listing_fallback IN (0, 1)),
  exclusion_keywords_json TEXT NOT NULL DEFAULT '[]',
  exclusion_fields_json TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  configuration_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX idx_saved_collection_profiles_source ON saved_collection_profiles(source);
CREATE INDEX idx_saved_collection_profiles_favorite ON saved_collection_profiles(is_favorite DESC, updated_at DESC);
CREATE INDEX idx_saved_collection_profiles_updated ON saved_collection_profiles(updated_at DESC);

ALTER TABLE ingestion_runs ADD COLUMN saved_profile_id TEXT;
ALTER TABLE ingestion_runs ADD COLUMN saved_profile_name TEXT;
ALTER TABLE ingestion_runs ADD COLUMN saved_profile_revision INTEGER;
ALTER TABLE ingestion_runs ADD COLUMN saved_profile_configuration_hash TEXT;
