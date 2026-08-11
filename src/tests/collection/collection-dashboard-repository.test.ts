import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ingestSanitizedFixtures } from "../../db/services/fixture-ingestion-service";
import { seedFictionalDemoJobs } from "../../db/services/demo-seed-service";
import { CollectionDashboardRepository } from "../../server/collection-dashboard/repository";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const RUN = "11111111-1111-4111-8111-111111111111";

function prepared() {
  testDatabase = createTestDatabase(); const db = testDatabase.database;
  ingestSanitizedFixtures(db); seedFictionalDemoJobs(db);
  const jobs = db.prepare("SELECT id FROM jobs ORDER BY id LIMIT 4").all() as Array<{ id: string }>;
  db.prepare(`UPDATE jobs SET observation_kind='bounded_listing_collection', normalized_regions_json='["seoul"]',
    region_normalization_confidence='exact', display_map_latitude=37.5, display_map_longitude=127.0,
    collection_preset_id='seoul-ai', collection_preset_label='서울 AI 일자리', collection_keyword='AI', observed_at=? WHERE id=?`)
    .run("2026-08-05T01:00:00.000Z", jobs[0]!.id);
  db.prepare(`UPDATE jobs SET observation_kind='bounded_manual_collection', normalized_regions_json='["seoul","gyeonggi"]',
    region_normalization_confidence='multiple', collection_preset_id='capital-ai', collection_preset_label='서울·경기 AI 일자리',
    collection_keyword='AI', observed_at=? WHERE id=?`).run("2026-08-05T02:00:00.000Z", jobs[1]!.id);
  db.prepare(`UPDATE jobs SET normalized_regions_json='[]', region_normalization_confidence='unknown' WHERE id=?`).run(jobs[2]!.id);
  db.prepare(`UPDATE jobs SET normalized_regions_json='["capital_scope"]', region_normalization_confidence='exact_source_filter',
    region_evidence_source='source_filter', source_area_code='I000,B000', displayed_location_present=0 WHERE id=?`).run(jobs[3]!.id);
  db.prepare(`INSERT INTO ingestion_runs (id,source,ingestion_type,status,started_at,completed_at,input_record_count,inserted_count,
    updated_count,unchanged_count,skipped_count,failed_count,permission_status,max_details,selected_detail_count,dry_run,created_at,
    search_page_count,exclusion_keywords_json,exclusion_fields_json,exclusion_config_hash,excluded_candidate_count,selected_candidate_count_after_exclusion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(RUN, "jobkorea", "jobkorea_one_shot_transport", "completed", "2026-08-05T03:00:00.000Z",
      "2026-08-05T03:00:10.000Z", 6, 1, 1, 1, 1, 1, "unverified", 4, 4, 0, "2026-08-05T03:00:00.000Z", 1,
      JSON.stringify(["강사", "전기"]), JSON.stringify(["title", "category"]), "hash", 2, 4);
  db.prepare(`INSERT INTO ingestion_items (ingestion_run_id,source,source_posting_id,canonical_job_id,result,diagnostic_codes,content_hash,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(RUN, "jobkorea", "1", jobs[0]!.id, "inserted", JSON.stringify(["JOBKOREA_LISTING_FALLBACK_USED"]), "hash", "2026-08-05T03:00:01.000Z");
  db.prepare(`INSERT INTO ingestion_items (ingestion_run_id,source,source_posting_id,canonical_job_id,result,diagnostic_codes,content_hash,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(RUN, "jobkorea", "2", null, "failed", JSON.stringify(["JOBKOREA_ACCESS_BLOCKED"]), null, "2026-08-05T03:00:02.000Z");
  db.prepare(`INSERT INTO ingestion_runs (id,source,ingestion_type,status,started_at,completed_at,input_record_count,failed_count,dry_run,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("33333333-3333-4333-8333-333333333333", "jobkorea", "jobkorea_one_shot_transport", "failed",
      "2026-08-05T04:00:00.000Z", "2026-08-05T04:00:03.000Z", 0, 1, 0, "2026-08-05T04:00:00.000Z");
  db.prepare(`INSERT INTO ingestion_runs (id,source,ingestion_type,status,started_at,completed_at,input_record_count,dry_run,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run("44444444-4444-4444-8444-444444444444", "albamon", "albamon_listing_collection", "completed",
      "2026-08-05T05:00:00.000Z", "2026-08-05T05:00:02.000Z", 2, 1, "2026-08-05T05:00:00.000Z");
  return db;
}

describe("CollectionDashboardRepository", () => {
  it("aggregates current inventory once, including region, completeness, and map coverage", () => {
    const db = prepared();
    // Extra provenance observations must never become extra jobs.
    const before = (db.prepare("SELECT COUNT(*) count FROM job_provenance_history").get() as { count: number }).count;
    const dashboard = new CollectionDashboardRepository(db, () => new Date("2026-08-06T00:00:00Z")).getDashboard({ period: "30d", source: "all", status: "all" });
    expect(dashboard.inventory.totalJobs).toBe(16);
    expect(dashboard.inventory.fixtureRecords).toBe(6);
    expect(dashboard.inventory.fictionalRecords).toBe(10);
    expect(dashboard.sources.reduce((sum, source) => sum + source.storedJobs, 0)).toBe(16);
    expect(dashboard.inventory.manuallyCollectedRecords).toBe(2);
    expect(dashboard.inventory.listingOnlyRecords).toBe(1);
    expect(dashboard.inventory.detailCompleteRecords).toBe(1);
    expect(dashboard.inventory.completenessUnknownRecords).toBe(14);
    expect(dashboard.regions.seoul.total).toBeGreaterThanOrEqual(1);
    expect(dashboard.regions.multiple.total).toBe(1);
    expect(dashboard.regions.capitalScope.total).toBe(1);
    expect(dashboard.dataQuality.capitalScopeOnlyRecords).toBe(1);
    expect(dashboard.regions.unknown.total).toBeGreaterThan(0);
    expect(dashboard.mapCoverage.eligible).toBeGreaterThanOrEqual(1);
    expect((db.prepare("SELECT COUNT(*) count FROM job_provenance_history").get() as { count: number }).count).toBe(before);
  });

  it("filters persisted write analytics by period, source, and status without changing inventory", () => {
    const db = prepared(); const repository = new CollectionDashboardRepository(db, () => new Date("2026-08-06T00:00:00Z"));
    const current = repository.getDashboard({ period: "7d", source: "jobkorea", status: "completed" });
    expect(current.inventory.totalJobs).toBe(16);
    expect(current.effectiveness).toMatchObject({ runs: 1, selectedCandidates: 4, inserted: 1, updated: 1, unchanged: 1, lowerCompletenessSkips: 1, failedItems: 1, excludedCandidates: 2 });
    expect(current.effectiveness.listingFallbacks).toBe(1);
    expect(current.effectiveness.successfulDetailParses).toBe(0);
    expect(current.effectiveness.failureRate).toBe(25);
    const absent = repository.getDashboard({ period: "7d", source: "albamon", status: "failed" });
    expect(absent.effectiveness.runs).toBe(0); expect(absent.recentRuns).toEqual([]);
    const failed = repository.getDashboard({ period: "30d", source: "jobkorea", status: "failed" });
    expect(failed.effectiveness.runs).toBe(1); expect(failed.recentRuns[0]).toMatchObject({ status: "failed", failed: 1 });
    expect(repository.getDashboard({ period: "all", source: "all", status: "all" }).recentRuns.some((run) => run.id.startsWith("44444444"))).toBe(false);
  });

  it("aggregates exclusion configuration deterministically and keeps legacy metadata unknown", () => {
    const db = prepared(); const repository = new CollectionDashboardRepository(db, () => new Date("2026-08-06T00:00:00Z"));
    const dashboard = repository.getDashboard({ period: "all", source: "jobkorea", status: "completed" });
    expect(dashboard.exclusions).toMatchObject({ runsUsingExclusions: 1, candidatesBefore: 6, candidatesExcluded: 2, candidatesAfter: 4, exclusionRate: 33.3 });
    expect(dashboard.exclusions.topKeywords).toEqual([{ keyword: "강사", uses: 1 }, { keyword: "전기", uses: 1 }]);
    expect(dashboard.exclusions.fields).toEqual([{ field: "category", uses: 1 }, { field: "title", uses: 1 }]);
    const legacy = db.prepare("SELECT id FROM ingestion_runs WHERE exclusion_config_hash IS NULL AND source IN ('jobkorea','albamon') LIMIT 1").get() as { id: string } | undefined;
    if (legacy) expect(repository.getRunDetail(legacy.id)?.excluded).toBeNull();
  });

  it("returns bounded sanitized run detail and failure categories", () => {
    const detail = new CollectionDashboardRepository(prepared()).getRunDetail(RUN)!;
    expect(detail).toMatchObject({ id: RUN, presetId: "seoul-ai", candidatesBeforeExclusion: 6, excluded: 2, selectedCandidates: 4, listingFallbacks: 1, permissionStatus: "unverified" });
    expect(detail.exclusionKeywords).toEqual(["강사", "전기"]);
    expect(detail.failureSummaries).toEqual([{ category: "access_blocked", count: 1 }]);
    expect(JSON.stringify(detail)).not.toMatch(/stack|raw_html|response_body|cookie/i);
    expect(new CollectionDashboardRepository(testDatabase!.database).getRunDetail("22222222-2222-4222-8222-222222222222")).toBeNull();
  });
});
