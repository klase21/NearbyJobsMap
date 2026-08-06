import "server-only";
import type Database from "better-sqlite3";
import { EXCLUSION_FIELDS, type ExclusionField } from "../../services/collection-exclusion";
import type { CollectionDashboardData, CollectionDashboardFilters, CollectionRunDetail, CollectionRunSummary, DashboardSourceOverview } from "./contracts";

type Row = Record<string, unknown>;
const n = (value: unknown): number => Number(value ?? 0);
const nullableNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const nullableString = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const ratio = (numerator: number | null, denominator: number | null): number | null => denominator && numerator !== null ? Math.round(numerator / denominator * 1000) / 10 : null;
const manualSql = "observation_kind IN ('bounded_manual_collection','bounded_listing_collection')";
const listingSql = "observation_kind = 'bounded_listing_collection'";
const detailSql = "observation_kind = 'bounded_manual_collection'";

function safeStringArray(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null; }
  catch { return null; }
}

function runWhere(filters: CollectionDashboardFilters, now: Date): { sql: string; params: unknown[] } {
  const clauses = ["r.source IN ('jobkorea','albamon')", "r.dry_run = 0"];
  const params: unknown[] = [];
  if (filters.period !== "all") { clauses.push("r.started_at >= ?"); params.push(new Date(now.getTime() - (filters.period === "7d" ? 7 : 30) * 86_400_000).toISOString()); }
  if (filters.source !== "all") { clauses.push("r.source = ?"); params.push(filters.source); }
  if (filters.status === "completed") clauses.push("r.status IN ('completed','partial')");
  if (filters.status === "failed") clauses.push("r.status IN ('failed','blocked')");
  return { sql: clauses.join(" AND "), params };
}

function summary(row: Row): CollectionRunSummary {
  const startedAt = String(row.started_at); const completedAt = nullableString(row.completed_at);
  return {
    id: String(row.id), source: row.source === "albamon" ? "albamon" : "jobkorea", presetId: nullableString(row.preset_id),
    presetLabel: nullableString(row.preset_label), status: String(row.status), startedAt, completedAt,
    selectedCandidates: nullableNumber(row.selected_candidates), inserted: n(row.inserted_count), updated: n(row.updated_count),
    unchanged: n(row.unchanged_count), skipped: n(row.skipped_count), failed: n(row.failed_count),
    excluded: nullableNumber(row.excluded_candidates), durationMs: completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : null,
    savedProfile: typeof row.saved_profile_id === "string" ? { id: String(row.saved_profile_id), name: String(row.saved_profile_name), revision: n(row.saved_profile_revision),
      configurationHash: String(row.saved_profile_configuration_hash), deleted: n(row.profile_deleted) === 1 } : null,
  };
}

export class CollectionDashboardRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date = () => new Date()) {}

  getDashboard(filters: CollectionDashboardFilters): CollectionDashboardData {
    const profileRow = this.database.prepare(`SELECT COUNT(*) total, SUM(source='jobkorea') jobkorea, SUM(source='albamon') albamon,
      SUM(is_favorite=1) favorites, SUM(last_used_at >= ?) used_30 FROM saved_collection_profiles`).get(new Date(this.now().getTime() - 30 * 86_400_000).toISOString()) as Row;
    const profileRows = this.database.prepare(`SELECT id,name,source,is_favorite,last_used_at FROM saved_collection_profiles
      ORDER BY CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END, last_used_at DESC, updated_at DESC LIMIT 5`).all() as Row[];
    const recentProfiles = profileRows.map((row) => ({ id: String(row.id), name: String(row.name), source: row.source === "albamon" ? "albamon" as const : "jobkorea" as const,
      isFavorite: n(row.is_favorite) === 1, lastUsedAt: nullableString(row.last_used_at) }));
    const mostRecentlyUsedRow = profileRows.find((row) => row.last_used_at);
    const profiles = { total: n(profileRow.total), jobkorea: n(profileRow.jobkorea), albamon: n(profileRow.albamon), favorites: n(profileRow.favorites), usedLast30Days: n(profileRow.used_30),
      mostRecentlyUsed: mostRecentlyUsedRow ? { id: String(mostRecentlyUsedRow.id), name: String(mostRecentlyUsedRow.name), source: mostRecentlyUsedRow.source === "albamon" ? "albamon" as const : "jobkorea" as const, lastUsedAt: String(mostRecentlyUsedRow.last_used_at) } : null,
      recent: recentProfiles };
    const inventoryRow = this.database.prepare(`SELECT COUNT(*) total_jobs,
      SUM(source='jobkorea') jobkorea_jobs, SUM(source='albamon') albamon_jobs,
      SUM(provenance_kind='fixture_derived') fixture_records, SUM(is_fictional=1) fictional_records,
      SUM(${manualSql}) manual_records, SUM(${listingSql}) listing_only, SUM(${detailSql}) detail_complete,
      SUM(CASE WHEN observation_kind IS NULL OR observation_kind NOT IN ('bounded_manual_collection','bounded_listing_collection') THEN 1 ELSE 0 END) completeness_unknown,
      SUM(display_map_latitude IS NOT NULL AND display_map_longitude IS NOT NULL) map_eligible
      FROM jobs`).get() as Row;
    const inventory = {
      totalJobs: n(inventoryRow.total_jobs), jobkoreaJobs: n(inventoryRow.jobkorea_jobs), albamonJobs: n(inventoryRow.albamon_jobs),
      fixtureRecords: n(inventoryRow.fixture_records), fictionalRecords: n(inventoryRow.fictional_records), manuallyCollectedRecords: n(inventoryRow.manual_records),
      listingOnlyRecords: n(inventoryRow.listing_only), detailCompleteRecords: n(inventoryRow.detail_complete), completenessUnknownRecords: n(inventoryRow.completeness_unknown),
      mapEligibleRecords: n(inventoryRow.map_eligible), listOnlyRecords: n(inventoryRow.total_jobs) - n(inventoryRow.map_eligible),
    };

    const sourceRows = this.database.prepare(`SELECT source, COUNT(*) stored_jobs, SUM(${manualSql}) manual_records,
      SUM(provenance_kind='fixture_derived') fixture_records, SUM(${listingSql}) listing_only, SUM(${detailSql}) detail_complete,
      SUM(CASE WHEN observation_kind IS NULL OR observation_kind NOT IN ('bounded_manual_collection','bounded_listing_collection') THEN 1 ELSE 0 END) completeness_unknown,
      SUM(display_map_latitude IS NOT NULL AND display_map_longitude IS NOT NULL) map_eligible, MAX(observed_at) latest_observed_at
      FROM jobs WHERE source IN ('jobkorea','albamon') GROUP BY source ORDER BY source`).all() as Row[];
    const latestRuns = this.database.prepare(`SELECT r.id, r.source, r.status, r.started_at,
      (SELECT MAX(j.collection_preset_label) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) preset_label
      FROM ingestion_runs r WHERE r.source IN ('jobkorea','albamon') AND r.dry_run=0
      AND r.started_at=(SELECT MAX(r2.started_at) FROM ingestion_runs r2 WHERE r2.source=r.source AND r2.dry_run=0)`).all() as Row[];
    const latestBySource = new Map(latestRuns.map((row) => [String(row.source), row]));
    const sources: DashboardSourceOverview[] = sourceRows.map((row) => {
      const latest = latestBySource.get(String(row.source));
      return { source: row.source === "albamon" ? "albamon" : "jobkorea", storedJobs: n(row.stored_jobs), manuallyCollected: n(row.manual_records), fixture: n(row.fixture_records),
        listingOnly: n(row.listing_only), detailComplete: n(row.detail_complete), completenessUnknown: n(row.completeness_unknown), mapEligible: n(row.map_eligible),
        latestObservedAt: nullableString(row.latest_observed_at), latestRun: latest ? { status: String(latest.status), startedAt: String(latest.started_at), presetLabel: nullableString(latest.preset_label) } : null };
    });

    const regionRows = this.database.prepare(`SELECT
      CASE WHEN json_valid(normalized_regions_json)=0 OR json_array_length(normalized_regions_json)=0 THEN 'unknown'
        WHEN json_array_length(normalized_regions_json)>1 THEN 'multiple'
        WHEN EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value='seoul') THEN 'seoul'
        WHEN EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value='gyeonggi') THEN 'gyeonggi'
        ELSE 'other' END region_group,
      COUNT(*) total, SUM(${manualSql}) manual FROM jobs GROUP BY region_group`).all() as Row[];
    const regions = { seoul: { total: 0, manual: 0 }, gyeonggi: { total: 0, manual: 0 }, multiple: { total: 0, manual: 0 }, other: { total: 0, manual: 0 }, unknown: { total: 0, manual: 0 } };
    for (const row of regionRows) { const key = String(row.region_group) as keyof typeof regions; regions[key] = { total: n(row.total), manual: n(row.manual) }; }

    const completenessBySource = sources.map((source) => ({ source: source.source, listingOnly: source.listingOnly, detailComplete: source.detailComplete, unknown: source.completenessUnknown }));
    const mapBySource = sources.map((source) => ({ source: source.source, eligible: source.mapEligible, total: source.storedJobs, percentage: ratio(source.mapEligible, source.storedJobs) }));
    const mapCoverage = { eligible: inventory.mapEligibleRecords, listOnly: inventory.listOnlyRecords, percentage: ratio(inventory.mapEligibleRecords, inventory.totalJobs), bySource: mapBySource };
    const qualityRows = this.database.prepare(`SELECT address_quality, salary_quality, COUNT(*) count
      FROM jobs GROUP BY address_quality, salary_quality`).all() as Row[];
    const address = { full_address: 0, city_district: 0, region_only: 0, multiple_locations: 0, unknown: 0, contaminated: 0 };
    const salary = { structured: 0, display_only: 0, negotiable: 0, unknown: 0, invalid: 0 };
    for (const row of qualityRows) {
      const count = n(row.count);
      const addressKey = String(row.address_quality ?? "unknown") as keyof typeof address;
      const salaryKey = String(row.salary_quality ?? "unknown") as keyof typeof salary;
      if (addressKey in address) address[addressKey] += count;
      if (salaryKey in salary) salary[salaryKey] += count;
    }
    const qualityTotals = this.database.prepare(`SELECT
      SUM(display_map_latitude IS NOT NULL AND display_map_longitude IS NOT NULL) coordinate_records,
      SUM(commute_ready=1) commute_ready_records FROM jobs`).get() as Row;
    const dataQuality = { address, salary, coordinateRecords: n(qualityTotals.coordinate_records), commuteReadyRecords: n(qualityTotals.commute_ready_records) };

    const where = runWhere(filters, this.now());
    const runRows = this.database.prepare(`SELECT r.*,
      CASE WHEN r.saved_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saved_collection_profiles p WHERE p.id=r.saved_profile_id) THEN 1 ELSE 0 END profile_deleted,
      CASE WHEN r.exclusion_config_hash IS NULL THEN NULL ELSE r.excluded_candidate_count END excluded_candidates,
      CASE WHEN r.exclusion_config_hash IS NULL THEN NULL ELSE r.selected_candidate_count_after_exclusion END selected_after_exclusion,
      COALESCE((SELECT MAX(j.collection_preset_id) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id), NULL) preset_id,
      COALESCE((SELECT MAX(j.collection_preset_label) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id), NULL) preset_label,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result='failed') item_failures,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed') successful_items,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND (i.source='albamon' OR i.diagnostic_codes LIKE '%JOBKOREA_LISTING_FALLBACK_USED%' OR i.diagnostic_codes LIKE '%JOBKOREA_DETAIL_COMPLETE%')) classified_outcomes,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND i.diagnostic_codes LIKE '%JOBKOREA_DETAIL_COMPLETE%') detail_successes,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND i.diagnostic_codes LIKE '%JOBKOREA_LISTING_FALLBACK_USED%') listing_fallbacks
      FROM ingestion_runs r WHERE ${where.sql} ORDER BY r.started_at DESC`).all(...where.params) as Row[];
    const selectedValues = runRows.map((row) => nullableNumber(row.selected_after_exclusion) ?? nullableNumber(row.selected_detail_count)).filter((value): value is number => value !== null);
    const exclusionValues = runRows.filter((row) => row.exclusion_config_hash !== null);
    const selected = selectedValues.length === runRows.length ? selectedValues.reduce((a, b) => a + b, 0) : runRows.length ? null : 0;
    const detailAttempts = runRows.length ? runRows.reduce((sum, row) => sum + (row.source === "jobkorea" ? n(row.selected_detail_count) : 0), 0) : 0;
    const outcomeCompletenessKnown = runRows.every((row) => n(row.successful_items) === n(row.classified_outcomes));
    const detailSuccesses = outcomeCompletenessKnown ? runRows.reduce((sum, row) => sum + n(row.detail_successes), 0) : null;
    const listingFallbacks = outcomeCompletenessKnown ? runRows.reduce((sum, row) => sum + n(row.listing_fallbacks), 0) : null;
    const failedItems = runRows.reduce((sum, row) => sum + n(row.item_failures), 0);
    const inserted = runRows.reduce((sum, row) => sum + n(row.inserted_count), 0); const updated = runRows.reduce((sum, row) => sum + n(row.updated_count), 0);
    const unchanged = runRows.reduce((sum, row) => sum + n(row.unchanged_count), 0); const skipped = runRows.reduce((sum, row) => sum + n(row.skipped_count), 0);
    const excluded = exclusionValues.length === runRows.length ? exclusionValues.reduce((sum, row) => sum + n(row.excluded_candidates), 0) : runRows.length ? null : 0;
    const effectiveness = { runs: runRows.length, selectedCandidates: selected, detailAttempts, successfulDetailParses: detailSuccesses, listingFallbacks,
      inserted, updated, unchanged, lowerCompletenessSkips: skipped, failedItems, excludedCandidates: excluded,
      validRecordYield: ratio(inserted + updated + unchanged + skipped, selected), insertUpdateYield: ratio(inserted + updated, selected),
      listingFallbackRate: ratio(listingFallbacks, selected), failureRate: ratio(failedItems, selected) };

    const keywordUses = new Map<string, number>(); const fieldUses = new Map<ExclusionField, number>();
    for (const row of exclusionValues) {
      for (const keyword of safeStringArray(row.exclusion_keywords_json) ?? []) keywordUses.set(keyword, (keywordUses.get(keyword) ?? 0) + 1);
      for (const field of safeStringArray(row.exclusion_fields_json) ?? []) if (EXCLUSION_FIELDS.includes(field as ExclusionField)) fieldUses.set(field as ExclusionField, (fieldUses.get(field as ExclusionField) ?? 0) + 1);
    }
    const exclusionBefore = exclusionValues.length ? exclusionValues.reduce((sum, row) => sum + n(row.excluded_candidates) + n(row.selected_after_exclusion), 0) : null;
    const exclusionExcluded = exclusionValues.length ? exclusionValues.reduce((sum, row) => sum + n(row.excluded_candidates), 0) : null;
    const exclusionAfter = exclusionValues.length ? exclusionValues.reduce((sum, row) => sum + n(row.selected_after_exclusion), 0) : null;
    const exclusions = { runsUsingExclusions: exclusionValues.filter((row) => (safeStringArray(row.exclusion_keywords_json) ?? []).length > 0).length,
      candidatesBefore: exclusionBefore, candidatesExcluded: exclusionExcluded, candidatesAfter: exclusionAfter, exclusionRate: ratio(exclusionExcluded, exclusionBefore),
      topKeywords: [...keywordUses].map(([keyword, uses]) => ({ keyword, uses })).sort((a, b) => b.uses - a.uses || a.keyword.localeCompare(b.keyword, "ko")).slice(0, 10),
      fields: [...fieldUses].map(([field, uses]) => ({ field, uses })).sort((a, b) => b.uses - a.uses || a.field.localeCompare(b.field)) };

    const recentRuns = runRows.slice(0, 20).map((row) => summary({ ...row, selected_candidates: row.selected_after_exclusion ?? row.selected_detail_count }));
    return { generatedAt: this.now().toISOString(), filters, inventory, sources, regions, completenessBySource, mapCoverage, dataQuality, effectiveness, exclusions, recentRuns, profiles };
  }

  getRunDetail(runId: string): CollectionRunDetail | null {
    const row = this.database.prepare(`SELECT r.*,
      CASE WHEN r.saved_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saved_collection_profiles p WHERE p.id=r.saved_profile_id) THEN 1 ELSE 0 END profile_deleted,
      CASE WHEN r.exclusion_config_hash IS NULL THEN NULL ELSE r.excluded_candidate_count END excluded_candidates,
      CASE WHEN r.exclusion_config_hash IS NULL THEN NULL ELSE r.selected_candidate_count_after_exclusion END selected_after_exclusion,
      (SELECT MAX(j.collection_preset_id) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) preset_id,
      (SELECT MAX(j.collection_preset_label) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) preset_label,
      (SELECT MAX(j.collection_keyword) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) keyword,
      (SELECT MAX(j.requested_regions_json) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) requested_regions,
      (SELECT MAX(j.observation_kind) FROM ingestion_items i JOIN jobs j ON j.id=i.canonical_job_id WHERE i.ingestion_run_id=r.id) provenance_type,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed') successful_items,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND (i.source='albamon' OR i.diagnostic_codes LIKE '%JOBKOREA_LISTING_FALLBACK_USED%' OR i.diagnostic_codes LIKE '%JOBKOREA_DETAIL_COMPLETE%')) classified_outcomes,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND i.diagnostic_codes LIKE '%JOBKOREA_DETAIL_COMPLETE%') detail_successes,
      (SELECT COUNT(*) FROM ingestion_items i WHERE i.ingestion_run_id=r.id AND i.result!='failed' AND i.diagnostic_codes LIKE '%JOBKOREA_LISTING_FALLBACK_USED%') listing_fallbacks
      FROM ingestion_runs r WHERE r.id=? AND r.source IN ('jobkorea','albamon') AND r.dry_run=0`).get(runId) as Row | undefined;
    if (!row) return null;
    const failureRows = this.database.prepare(`SELECT diagnostic_codes FROM ingestion_items WHERE ingestion_run_id=? AND result='failed' LIMIT 200`).all(runId) as Row[];
    const failures = new Map<CollectionRunDetail["failureSummaries"][number]["category"], number>();
    for (const failure of failureRows) { const category = failureCategory(safeStringArray(failure.diagnostic_codes) ?? []); failures.set(category, (failures.get(category) ?? 0) + 1); }
    const base = summary({ ...row, selected_candidates: row.selected_after_exclusion ?? row.selected_detail_count });
    return { ...base, ingestionType: String(row.ingestion_type), keyword: nullableString(row.keyword), requestedRegions: safeStringArray(row.requested_regions),
      pages: nullableNumber(row.search_page_count), maxCandidates: nullableNumber(row.max_details), exclusionKeywords: row.exclusion_config_hash ? safeStringArray(row.exclusion_keywords_json) : null,
      exclusionFields: row.exclusion_config_hash ? (safeStringArray(row.exclusion_fields_json)?.filter((field): field is ExclusionField => EXCLUSION_FIELDS.includes(field as ExclusionField)) ?? []) : null,
      candidatesBeforeExclusion: row.exclusion_config_hash ? n(row.excluded_candidates) + n(row.selected_after_exclusion) : null,
      detailAttempts: nullableNumber(row.selected_detail_count),
      successfulDetailParses: n(row.successful_items) === n(row.classified_outcomes) ? n(row.detail_successes) : null,
      listingFallbacks: n(row.successful_items) === n(row.classified_outcomes) ? n(row.listing_fallbacks) : null,
      permissionStatus: nullableString(row.permission_status), provenanceType: nullableString(row.provenance_type),
      failureSummaries: [...failures].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)).slice(0, 6) };
  }
}

function failureCategory(codes: string[]): CollectionRunDetail["failureSummaries"][number]["category"] {
  const text = codes.join(" ").toUpperCase();
  if (text.includes("CAPTCHA") || text.includes("VERIFICATION")) return "verification";
  if (text.includes("ACCESS") || text.includes("LOGIN") || text.includes("BLOCKED")) return "access_blocked";
  if (text.includes("TRANSPORT") || text.includes("NAVIGATION") || text.includes("TIMEOUT") || text.includes("HTTP")) return "transport_failed";
  if (text.includes("PARSE") || text.includes("PARSER")) return "parse_failed";
  if (text.includes("INVALID") || text.includes("MISMATCH")) return "invalid_detail";
  return "other";
}
