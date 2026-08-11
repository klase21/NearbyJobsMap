UPDATE jobs
SET normalized_regions_json = '["capital_scope"]'
WHERE source = 'albamon'
  AND region_evidence_source = 'source_filter'
  AND source_area_code = 'I000,B000'
  AND displayed_location_present = 0;

UPDATE job_provenance_history
SET normalized_regions_json = '["capital_scope"]'
WHERE region_evidence_source = 'source_filter'
  AND source_area_code = 'I000,B000'
  AND displayed_location_present = 0
  AND job_id IN (SELECT id FROM jobs WHERE source = 'albamon');
