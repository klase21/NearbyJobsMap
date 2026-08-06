import { afterEach, describe, expect, it } from "vitest";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { parseSalary } from "../../services/salary-parser";
import { assessJobDataQuality, classifyAddressQuality, classifySalaryQuality, isContaminatedLocation } from "../../services/job-data-quality";
import { parseJobKoreaBackfillArgs } from "../../sources/jobkorea/backfill/jobkorea-backfill-cli";
import { backfillJobKoreaListingsOnce } from "../../sources/jobkorea/backfill/jobkorea-backfill-service";
import { assertJobKoreaDatabaseIntegrity } from "../../sources/jobkorea/backfill/jobkorea-quality-audit";
import { JobRepository } from "../../db/repositories/job-repository";
import { JobObservationRepository } from "../../server/job-observations/repository";
import type { JobKoreaBackfillOptions } from "../../sources/jobkorea/backfill/jobkorea-backfill-types";
import { buildJobKoreaListingPageResult } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { emptyJobKoreaFailedResourceSummary } from "../../sources/jobkorea/transport/jobkorea-resource-diagnostics";
import { emptyJobKoreaShadowStructure } from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import type { JobKoreaCollectionCandidate, JobKoreaSearchExecution } from "../../sources/jobkorea/transport/jobkorea-search-types";
import { jobKoreaSnapshot } from "../transport/jobkorea-snapshot-test-factory";

const databases: TestDatabase[] = [];
afterEach(() => { while (databases.length) databases.pop()!.cleanup(); });

function candidate(id: string, position: number, regionText: string | null = "서울 강남구"): JobKoreaCollectionCandidate {
  return { postingId: id, canonicalUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`, firstSourcePosition: position,
    observedLinkCount: 1, listingClassification: "structurally_provisional",
    listingFields: { title: `AI 운영 ${id}`, companyName: `예시회사 ${id}`, regionText, salaryText: "연봉 4,000만원",
      employmentTypes: ["정규직"], experienceRequirement: "경력무관", educationRequirement: "학력무관", postedAt: "2026-08-07", deadlineText: "채용시" } };
}

function page(number: number, candidates: JobKoreaCollectionCandidate[]) {
  const links = candidates.reduce((sum, item) => sum + item.observedLinkCount, 0);
  return buildJobKoreaListingPageResult(jobKoreaSnapshot([], { finalUrl: `https://www.jobkorea.co.kr/Search?stext=AI&Page_No=${number}`,
    collectionCandidates: candidates, shadowStructure: emptyJobKoreaShadowStructure(links),
    evidence: { resultRootCount: 1, allNumericDetailLinkCount: links, numericLinksInsideKnownResultRoots: links, rejectedDetailLinkCount: 0 } }), number);
}

function execution(pages: ReturnType<typeof page>[], onClose?: () => void): JobKoreaSearchExecution {
  return { transportUsed: "playwright", pages, consoleErrors: [], failedResources: emptyJobKoreaFailedResourceSummary(),
    directVerification: { classification: "direct_endpoint_unavailable", observation: null,
      diagnostic: { severity: "warning", code: "NOT_USED", field: null, message: "not used" } },
    searchNavigationCount: pages.length, detailNavigationCount: 0, directRequestCount: 0, lifecycleDiagnostics: [],
    async fetchDetail() { throw new Error("listing-only backfill must not navigate to details"); },
    async close() { onClose?.(); } };
}

function options(mode: "dry-run" | "write" = "dry-run", pageTo = 2): JobKoreaBackfillOptions {
  return { presetId: "capital-ai", presetLabel: "수도권 AI 일자리", keyword: "AI",
    searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI&tabType=recruit", pageFrom: 1, pageTo,
    maxCandidates: 200, listingOnly: true, mode, exclusion: { keywords: [], fields: ["title", "company", "location", "category", "employment_type", "work_schedule"] } };
}

describe("JobKorea listing-only backfill CLI", () => {
  it("requires bounded explicit ranges, listing-only, and strict write confirmation", () => {
    const dry = parseJobKoreaBackfillArgs(["--preset", "capital-ai", "--page-from", "1", "--page-to", "10", "--max-candidates", "200", "--listing-only", "--dry-run", "--confirm"]);
    expect(dry).toMatchObject({ pageFrom: 1, pageTo: 10, maxCandidates: 200, listingOnly: true, mode: "dry-run" });
    for (const to of ["0", "11"]) expect(() => parseJobKoreaBackfillArgs(["--preset", "capital-ai", "--page-from", "1", "--page-to", to, "--max-candidates", "1", "--listing-only", "--dry-run", "--confirm"])).toThrow();
    expect(() => parseJobKoreaBackfillArgs(["--preset", "capital-ai", "--page-from", "1", "--page-to", "1", "--max-candidates", "201", "--listing-only", "--dry-run", "--confirm"])).toThrow();
    expect(() => parseJobKoreaBackfillArgs(["--preset", "capital-ai", "--page-from", "1", "--page-to", "1", "--max-candidates", "1", "--listing-only", "--write", "--confirm-backfill", "wrong"])).toThrow();
  });
});

describe("JobKorea listing-only backfill service", () => {
  it("visits the explicit range, keeps duplicate-only pages, filters before the cap, and never requests details", async () => {
    const test = createTestDatabase(); databases.push(test); let closed = false; let receivedPages: number[] | undefined;
    const pages = [page(1, [candidate("91000001", 1), candidate("91000002", 2, "부산")]), page(2, [candidate("91000001", 1), candidate("91000003", 2, "경기 성남시")])];
    const result = await backfillJobKoreaListingsOnce({ ...options(), maxCandidates: 1 }, { database: test.database,
      createExecution: async (input) => { receivedPages = input.pageNumbers; return execution(pages, () => { closed = true; }); },
      now: () => new Date("2026-08-07T00:00:00Z") });
    expect(receivedPages).toEqual([1, 2]); expect(result).toMatchObject({ status: "completed", pagesCompleted: 2, parserFailurePages: 2, unresolvedPageFailures: 0, pageClassifications: { malformed_results: 2 }, uniquePostingIds: 3, crossPageDuplicates: 1,
      seoulCandidates: 1, gyeonggiCandidates: 1, otherRegionCandidates: 1, selectedCandidates: 1, detailRequests: 0, browserDetailNavigations: 0, retries: 0 });
    expect(closed).toBe(true); expect(test.database.prepare("SELECT COUNT(*) count FROM jobs").get()).toEqual({ count: 0 });
  });

  it("writes one atomic run with listing-only provenance, an observation, and quality metadata", async () => {
    const test = createTestDatabase(); databases.push(test);
    const result = await backfillJobKoreaListingsOnce(options("write", 1), { database: test.database,
      createExecution: async () => execution([page(1, [candidate("92000001", 1)])]), now: () => new Date("2026-08-07T00:00:00Z") });
    expect(result).toMatchObject({ actualInserts: 1, actualUpdates: 0, actualUnchanged: 0, failedItems: 0, observationsAdded: 1, detailRequests: 0 });
    expect(test.database.prepare(`SELECT source_posting_id,observation_kind,detail_access_status,address_quality,salary_quality FROM jobs`).get()).toEqual({
      source_posting_id: "92000001", observation_kind: "bounded_listing_collection", detail_access_status: "not_attempted", address_quality: "city_district", salary_quality: "structured" });
    expect(test.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get()).toEqual({ count: 1 });
    expect(test.database.prepare("SELECT COUNT(*) count FROM ingestion_items").get()).toEqual({ count: 1 });
    expect(test.database.prepare("SELECT COUNT(*) count FROM job_observations").get()).toEqual({ count: 1 });
    expect(() => assertJobKoreaDatabaseIntegrity(test.database, ["92000001"])).not.toThrow();
  });

  it("rejects contaminated location before the cap and selects the next trustworthy record", async () => {
    const test = createTestDatabase(); databases.push(test);
    const contaminated = candidate("92500001", 1); contaminated.listingFields = { ...contaminated.listingFields!, regionText: contaminated.listingFields!.title };
    const result = await backfillJobKoreaListingsOnce({ ...options("dry-run", 1), maxCandidates: 1 }, { database: test.database,
      createExecution: async () => execution([page(1, [contaminated, candidate("92500002", 2)])]) });
    expect(result).toMatchObject({ locationContaminationRejected: 1, unknownRegionCandidates: 1, selectedCandidates: 1, predictedInserts: 1 });
  });

  it("preserves an existing detail-complete row instead of downgrading it", async () => {
    const test = createTestDatabase(); databases.push(test); const repository = new JobRepository(test.database);
    const detail = canonicalJob({ id: "jobkorea:92600001", sourcePostingId: "92600001", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/92600001",
      canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/92600001", title: "상세 확인 제목" });
    const seeded = repository.upsert(detail, {
      recordKind: "live_one_shot_observation", evidenceType: "public_page_observation", sourceFixtureReference: "detail:92600001", mapPosition: null,
      permissionStatus: "unverified", observationKind: "bounded_manual_collection", observationTransport: "direct", detailAccessStatus: "available" });
    new JobObservationRepository(test.database).observe({ jobId: seeded.jobId, runId: "detail-seed", job: detail, contentHash: seeded.contentHash,
      completeness: "detail_complete", observedAt: "2026-08-06T00:00:00Z" });
    const result = await backfillJobKoreaListingsOnce(options("write", 1), { database: test.database,
      createExecution: async () => execution([page(1, [candidate("92600001", 1)])]) });
    expect(result).toMatchObject({ actualSkips: 1, actualUpdates: 0, observationsAdded: 0 });
    expect(test.database.prepare("SELECT title,observation_kind FROM jobs WHERE source_posting_id='92600001'").get()).toEqual({ title: "상세 확인 제목", observation_kind: "bounded_manual_collection" });
  });

  it("rolls back the whole batch when the post-write gate fails", async () => {
    const test = createTestDatabase(); databases.push(test);
    await expect(backfillJobKoreaListingsOnce(options("write", 1), { database: test.database,
      createExecution: async () => execution([page(1, [candidate("93000001", 1), candidate("93000002", 2)])]),
      validateWrite: () => { throw new Error("synthetic critical failure"); } })).rejects.toThrow(/synthetic critical failure/);
    for (const table of ["jobs", "ingestion_runs", "ingestion_items", "job_provenance_history", "job_observations"]) {
      expect(test.database.prepare(`SELECT COUNT(*) count FROM ${table}`).get()).toEqual({ count: 0 });
    }
  });
});

describe("deterministic job data quality", () => {
  it("rejects title/company contamination and classifies address evidence conservatively", () => {
    expect(isContaminatedLocation("AI 운영", "AI 운영", "예시회사")).toBe(true);
    expect(classifyAddressQuality(canonicalJob())).toBe("full_address");
    expect(classifyAddressQuality(canonicalJob({ roadAddress: null, parcelAddress: null, addressOriginalText: "서울 강남구", workplaces: [], workplaceCount: 1 }))).toBe("city_district");
    expect(classifyAddressQuality(canonicalJob({ roadAddress: null, parcelAddress: null, addressOriginalText: "서울", city: "서울", district: null, workplaces: [], workplaceCount: 1 }))).toBe("region_only");
    expect(classifyAddressQuality(canonicalJob({ roadAddress: null, parcelAddress: null, addressOriginalText: null, workplaces: [], workplaceCount: 0 }))).toBe("unknown");
  });

  it("classifies salary without converting units and defines commute readiness conservatively", () => {
    expect(classifySalaryQuality(canonicalJob())).toBe("structured");
    expect(classifySalaryQuality(canonicalJob({ salary: parseSalary("회사 내규에 따름") }))).toBe("display_only");
    expect(classifySalaryQuality(canonicalJob({ salary: parseSalary("협의") }))).toBe("negotiable");
    expect(assessJobDataQuality(canonicalJob()).commuteReady).toBe(true);
    expect(assessJobDataQuality(canonicalJob({ roadAddress: null, parcelAddress: null, addressOriginalText: "서울 강남구", workplaces: [], workplaceCount: 1 })).commuteReady).toBe(false);
  });
});
