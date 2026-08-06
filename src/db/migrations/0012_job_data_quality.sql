ALTER TABLE jobs ADD COLUMN address_quality TEXT NOT NULL DEFAULT 'unknown'
  CHECK (address_quality IN ('full_address', 'city_district', 'region_only', 'multiple_locations', 'unknown', 'contaminated'));
ALTER TABLE jobs ADD COLUMN salary_quality TEXT NOT NULL DEFAULT 'unknown'
  CHECK (salary_quality IN ('structured', 'display_only', 'negotiable', 'unknown', 'invalid'));
ALTER TABLE jobs ADD COLUMN commute_ready INTEGER NOT NULL DEFAULT 0
  CHECK (commute_ready IN (0, 1));

CREATE INDEX idx_jobs_address_quality ON jobs(address_quality);
CREATE INDEX idx_jobs_salary_quality ON jobs(salary_quality);
