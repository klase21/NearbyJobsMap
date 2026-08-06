import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SavedProfileComparisonRepository } from "../../server/collection-profile-comparison/repository";
import { parseProfileComparisonRequest } from "../../server/collection-profile-comparison/request-validation";
import { SavedCollectionProfileRepository } from "../../server/collection-profiles/repository";
import type { SavedCollectionProfileInput } from "../../services/saved-collection-profile";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const input = (name: string, regions: Array<"seoul" | "gyeonggi">, exclusions: string[], source: "jobkorea" | "albamon" = "jobkorea"): SavedCollectionProfileInput => ({ name, source, basePresetId: source === "jobkorea" ? (regions.length === 2 ? "capital-ai" : regions[0] === "seoul" ? "seoul-ai" : "gyeonggi-ai") : "albamon-capital-today", strategy: source === "jobkorea" ? "jobkorea_keyword" : "albamon_today", keyword: source === "jobkorea" ? "AI" : null, regions, pages: 1, maxCandidates: 10, allowListingFallback: source === "jobkorea", exclusion: { keywords: exclusions, fields: ["title", "category"] }, isFavorite: false });

function setup() {
  testDatabase = createTestDatabase(); const db = testDatabase.database; const profiles = new SavedCollectionProfileRepository(db, () => new Date("2026-08-01T00:00:00Z"));
  const a = profiles.create(input("비교 서울 AI", ["seoul"], ["강사", "웨이터"])); const b = profiles.create(input("비교 경기 AI", ["gyeonggi"], ["강사", "전기"])); const c = profiles.create(input("비교 알바몬", ["seoul", "gyeonggi"], ["강사"], "albamon"));
  const addRun = (id: string, profile: typeof a, revision: number, hash: string | null, status = "completed") => db.prepare(`INSERT INTO ingestion_runs
    (id,source,ingestion_type,status,started_at,completed_at,input_record_count,inserted_count,updated_count,unchanged_count,skipped_count,failed_count,selected_detail_count,dry_run,created_at,exclusion_keywords_json,exclusion_fields_json,exclusion_config_hash,excluded_candidate_count,selected_candidate_count_after_exclusion,saved_profile_id,saved_profile_name,saved_profile_revision,saved_profile_configuration_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, profile.source, profile.source === "albamon" ? "albamon_listing_collection" : "jobkorea_one_shot_transport", status, "2026-08-05T00:00:00Z", "2026-08-05T00:00:10Z", 4, 1, 1, 1, 0, status === "failed" ? 1 : 0, 3, 0, "2026-08-05T00:00:00Z", JSON.stringify(profile.exclusion.keywords), JSON.stringify(profile.exclusion.fields), "exclusion", 1, 3, profile.id, profile.name, revision, hash);
  addRun("11111111-1111-4111-8111-111111111111", a, a.revision, a.configurationHash); addRun("22222222-2222-4222-8222-222222222222", b, b.revision, b.configurationHash);
  addRun("33333333-3333-4333-8333-333333333333", a, 0, "older-hash");
  const addItem = (run: string, posting: string, result: string, code: string) => db.prepare("INSERT INTO ingestion_items(ingestion_run_id,source,source_posting_id,canonical_job_id,result,diagnostic_codes,content_hash,created_at) VALUES(?,?,?,NULL,?,?,NULL,?)").run(run, "jobkorea", posting, result, JSON.stringify([code]), "2026-08-05T00:00:01Z");
  addItem("11111111-1111-4111-8111-111111111111", "100", "inserted", "JOBKOREA_LISTING_FALLBACK_USED"); addItem("11111111-1111-4111-8111-111111111111", "200", "unchanged", "JOBKOREA_DETAIL_COMPLETE"); addItem("11111111-1111-4111-8111-111111111111", "999", "failed", "JOBKOREA_PARSE_FAILED");
  addItem("22222222-2222-4222-8222-222222222222", "200", "updated", "JOBKOREA_LISTING_FALLBACK_USED"); addItem("22222222-2222-4222-8222-222222222222", "300", "skipped", "JOBKOREA_LISTING_FALLBACK_USED");
  return { db, a, b, c };
}

describe("saved profile comparison", () => {
  it("validates two-to-four distinct opaque profile IDs and rejects unexpected input", () => {
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    expect(parseProfileComparisonRequest({ profileIds: ids, period: "30d", revisionScope: "current" }).profileIds).toEqual(ids);
    expect(parseProfileComparisonRequest({ profileIds: [...ids, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"], period: "all", revisionScope: "all" }).profileIds).toHaveLength(4);
    expect(() => parseProfileComparisonRequest({ profileIds: ids.slice(0, 1), period: "30d", revisionScope: "current" })).toThrow();
    expect(() => parseProfileComparisonRequest({ profileIds: [...ids, ...ids, ids[0]], period: "30d", revisionScope: "current" })).toThrow();
    expect(() => parseProfileComparisonRequest({ profileIds: [ids[0], ids[0]], period: "30d", revisionScope: "current" })).toThrow(/중복/);
    expect(() => parseProfileComparisonRequest({ profileIds: ids, period: "year", revisionScope: "current" })).toThrow();
    expect(() => parseProfileComparisonRequest({ profileIds: ids, period: "30d", revisionScope: "old" })).toThrow();
    expect(() => parseProfileComparisonRequest({ profileIds: ids, period: "30d", revisionScope: "current", sql: "DROP" })).toThrow(/허용/);
  });

  it("compares configuration and normalized exclusion sets deterministically", () => {
    const { db, a, b } = setup(); const result = new SavedProfileComparisonRepository(db, () => new Date("2026-08-06T00:00:00Z")).compare({ profileIds: [a.id, b.id], period: "30d", revisionScope: "current" });
    expect(result.profiles.map((profile) => profile.id)).toEqual([a.id, b.id]);
    expect(result.configurationDifferences.find((item) => item.field === "regions")).toMatchObject({ same: false });
    expect(result.exclusions.commonKeywords).toEqual(["강사"]); expect(result.exclusions.uniqueKeywords).toEqual([{ profileId: a.id, keywords: ["웨이터"], truncated: false }, { profileId: b.id, keywords: ["전기"], truncated: false }]);
    expect(result.differenceSummary).toContain("지역이 다릅니다.");
  });

  it("aggregates current revision performance once and calculates exact same-source overlap", () => {
    const { db, a, b } = setup(); const result = new SavedProfileComparisonRepository(db, () => new Date("2026-08-06T00:00:00Z")).compare({ profileIds: [a.id, b.id], period: "7d", revisionScope: "current" });
    expect(result.performance[0]).toMatchObject({ writeRuns: 1, selectedCandidates: 3, excludedCandidates: 1, inserted: 1, updated: 1, unchanged: 1, failedItems: 1, exclusionRate: 25, failureRate: 33.3 });
    expect(result.overlap.pairs[0]).toMatchObject({ applicable: true, profileAIdentities: 2, profileBIdentities: 2, sharedIdentities: 1, uniqueToA: 1, uniqueToB: 1, overlapPercentage: 50, jaccardSimilarity: 33.3 });
    expect(result.overlap.pairs[0]!.sharedSampleIds).toEqual(["200"]);
  });

  it("includes older snapshots only in all-revision scope and marks cross-source overlap unavailable", () => {
    const { db, a, b, c } = setup(); const repository = new SavedProfileComparisonRepository(db, () => new Date("2026-08-06T00:00:00Z"));
    expect(repository.compare({ profileIds: [a.id, b.id], period: "all", revisionScope: "all" }).performance[0]!.writeRuns).toBe(2);
    const mixed = repository.compare({ profileIds: [a.id, b.id, c.id], period: "all", revisionScope: "current" });
    expect(mixed.performance[2]).toMatchObject({ writeRuns: 0, selectedCandidates: null }); expect(mixed.overlap.crossSourceLimited).toBe(true);
    expect(mixed.overlap.pairs.some((pair) => !pair.applicable)).toBe(true);
  });

  it("rejects stale or deleted profile IDs without mutating SQLite", () => {
    const { db, a } = setup(); const before = n(db.prepare("SELECT COUNT(*) count FROM ingestion_runs").get());
    expect(() => new SavedProfileComparisonRepository(db).compare({ profileIds: [a.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], period: "all", revisionScope: "all" })).toThrow(/찾을 수/);
    expect(n(db.prepare("SELECT COUNT(*) count FROM ingestion_runs").get())).toBe(before);
  });
});

function n(row: unknown): number { return Number((row as { count: number }).count); }
