import { afterEach, describe, expect, it } from "vitest";
import { parseJobKoreaCollectionArgs } from "../../sources/jobkorea/collection/jobkorea-collection-cli";
import { collectJobKoreaOnce, JOBKOREA_COLLECTION_DETAIL_CONCURRENCY, selectJobKoreaCollectionCandidates } from "../../sources/jobkorea/collection/jobkorea-collection-service";
import type { JobKoreaCollectionCandidate as SnapshotCandidate, JobKoreaSearchExecution } from "../../sources/jobkorea/transport/jobkorea-search-types";
import { buildJobKoreaListingPageResult } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { emptyJobKoreaFailedResourceSummary } from "../../sources/jobkorea/transport/jobkorea-resource-diagnostics";
import { JobKoreaHttpClient } from "../../sources/jobkorea/transport/jobkorea-http-client";
import { emptyJobKoreaShadowStructure } from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import { jobKoreaSnapshot } from "./jobkorea-snapshot-test-factory";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

const databases: TestDatabase[] = [];
afterEach(() => { while (databases.length) databases.pop()!.cleanup(); });

const collectionCandidate = (postingId: string, position: number, classification: SnapshotCandidate["listingClassification"] = "unclassified_result_link", observedLinkCount = 1): SnapshotCandidate => ({
  postingId, canonicalUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${postingId}`, firstSourcePosition: position,
  observedLinkCount, listingClassification: classification,
});

function page(number: number, candidates: SnapshotCandidate[]) {
  const linkCount = candidates.reduce((sum, item) => sum + item.observedLinkCount, 0);
  return buildJobKoreaListingPageResult(jobKoreaSnapshot([], {
    finalUrl: `https://www.jobkorea.co.kr/Search?stext=AI&Page_No=${number}`,
    collectionCandidates: candidates,
    shadowStructure: emptyJobKoreaShadowStructure(linkCount),
    evidence: { resultRootCount: 1, allNumericDetailLinkCount: linkCount,
      numericLinksInsideKnownResultRoots: linkCount, rejectedDetailLinkCount: 0 },
  }), number);
}

function html(id: string, title = `공고 ${id}`): string {
  return `<!doctype html><html><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: id }, url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`, title, hiringOrganization: { name: `회사 ${id}` }, datePosted: "2026-08-01", validThrough: "2026-08-31", employmentType: "정규직", jobLocation: { address: { streetAddress: "서울특별시 중구 세종대로", addressRegion: "서울", addressLocality: "중구" } } })}</script></html>`;
}

function execution(pages: ReturnType<typeof page>[]): JobKoreaSearchExecution {
  return {
    transportUsed: "playwright", pages, consoleErrors: [], failedResources: emptyJobKoreaFailedResourceSummary(),
    directVerification: { classification: "direct_endpoint_unavailable", observation: null, diagnostic: { severity: "warning", code: "NOT_USED", field: null, message: "not used" } },
    searchNavigationCount: pages.length, detailNavigationCount: 0, directRequestCount: 0, lifecycleDiagnostics: [],
    async fetchDetail() { throw new Error("HTTP detail transport should be used first"); },
    async close() {},
  };
}

function http(responses: Record<string, string | Error | { html: string; closed: boolean }> = {}, delay = 0) {
  let active = 0; let maximumConcurrency = 0;
  const client = new JobKoreaHttpClient(async (input) => {
    active += 1; maximumConcurrency = Math.max(maximumConcurrency, active); if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); active -= 1;
    const url = String(input); const id = /\/(\d+)$/.exec(url)?.[1] ?? ""; const value = responses[id]; if (value instanceof Error) throw value;
    const body = value && typeof value === "object" ? `${value.html}${value.closed ? "<p>마감되었습니다</p>" : ""}` : value ?? html(id);
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  });
  return { client, get maximumConcurrency() { return maximumConcurrency; } };
}

describe("JobKorea bounded collection CLI", () => {
  it("requires confirmation, one mode, 1..3 pages and 1..30 details", () => {
    expect(() => parseJobKoreaCollectionArgs(["--search-url", "https://www.jobkorea.co.kr/Search?stext=AI", "--pages", "1", "--max-details", "5", "--dry-run"])).toThrow(/confirm/);
    expect(parseJobKoreaCollectionArgs(["--search-url", "https://www.jobkorea.co.kr/Search?stext=AI", "--pages", "3", "--max-details", "30", "--write", "--confirm"]).mode).toBe("write");
    for (const pages of [0, 4]) expect(() => parseJobKoreaCollectionArgs(["--search-url", "https://www.jobkorea.co.kr/Search?stext=AI", "--pages", String(pages), "--max-details", "1", "--dry-run", "--confirm"])).toThrow();
    for (const count of [0, 31, 1.5]) expect(() => parseJobKoreaCollectionArgs(["--search-url", "https://www.jobkorea.co.kr/Search?stext=AI", "--pages", "1", "--max-details", String(count), "--dry-run", "--confirm"])).toThrow();
  });
});

describe("JobKorea collection candidate selection", () => {
  it("keeps page/source order, deduplicates posting IDs, retains metadata, and caps selection", () => {
    const selected = selectJobKoreaCollectionCandidates([
      page(2, [collectionCandidate("50000003", 1)]),
      page(1, [collectionCandidate("50000001", 3, "structurally_provisional", 3), collectionCandidate("50000002", 5, "recommendation"), collectionCandidate("50000003", 7)]),
    ], 2);
    expect(selected.uniquePostingIds).toBe(3);
    expect(selected.candidates.map((item) => item.sourcePostingId)).toEqual(["50000001", "50000002"]);
    expect(selected.candidates[0]).toMatchObject({ observedLinkCount: 3, listingClassification: "structurally_provisional", pageNumber: 1 });
  });

  it("does not gate promoted, recommendation, provisional, or unclassified root candidates", () => {
    const kinds = ["explicit_promoted", "recommendation", "structurally_provisional", "unclassified_result_link"] as const;
    const selected = selectJobKoreaCollectionCandidates([page(1, kinds.map((kind, index) => collectionCandidate(String(50000100 + index), index + 1, kind)))], 30);
    expect(selected.candidates.map((item) => item.listingClassification)).toEqual(kinds);
  });
});

describe("JobKorea bounded collection pipeline", () => {
  it("dry-runs detail parsing concurrently without any database write", async () => {
    const testDb = createTestDatabase(); databases.push(testDb);
    const candidates = Array.from({ length: 5 }, (_, index) => collectionCandidate(String(50001000 + index), index + 1));
    const mock = execution([page(1, candidates)]); const transport = http({}, 5);
    const result = await collectJobKoreaOnce({ searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI", pages: 1, maxDetails: 5, mode: "dry-run", confirm: true }, { database: testDb.database, createExecution: async () => mock, httpClient: transport.client });
    expect(result).toMatchObject({ detailPagesAttempted: 5, successfullyParsed: 5, predictedInserts: 5, actualInserts: 0 });
    expect(transport.maximumConcurrency).toBe(JOBKOREA_COLLECTION_DETAIL_CONCURRENCY);
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM jobs").get()).toEqual({ count: 0 });
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get()).toEqual({ count: 0 });
  });

  it("writes once, preserves exact identity, and is unchanged on a repeated run", async () => {
    const testDb = createTestDatabase(); databases.push(testDb);
    const candidates = [collectionCandidate("50002001", 1, "structurally_provisional", 3)];
    const options = { searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI", pages: 1 as const, maxDetails: 1, mode: "write" as const, confirm: true as const };
    const first = await collectJobKoreaOnce(options, { database: testDb.database, createExecution: async () => execution([page(1, candidates)]), httpClient: http().client });
    const second = await collectJobKoreaOnce(options, { database: testDb.database, createExecution: async () => execution([page(1, candidates)]), httpClient: http().client });
    expect(first.actualInserts).toBe(1); expect(second.actualUnchanged).toBe(1);
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM jobs WHERE source='jobkorea' AND source_posting_id='50002001'").get()).toEqual({ count: 1 });
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get()).toEqual({ count: 2 });
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM ingestion_items").get()).toEqual({ count: 2 });
    const row = testDb.database.prepare("SELECT observation_kind, source_fixture_reference FROM jobs WHERE source_posting_id='50002001'").get() as Record<string, string>;
    expect(row.observation_kind).toBe("bounded_manual_collection"); expect(row.source_fixture_reference).toContain("structurally_provisional:3:50002001");
  });

  it("records a failed detail without replacement or job insertion", async () => {
    const testDb = createTestDatabase(); databases.push(testDb);
    const candidates = [collectionCandidate("50003001", 1), collectionCandidate("50003002", 2)];
    const result = await collectJobKoreaOnce({ searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI", pages: 1, maxDetails: 2, mode: "write", confirm: true },
      { database: testDb.database, createExecution: async () => execution([page(1, candidates)]), httpClient: http({ "50003001": new Error("network") }).client });
    expect(result).toMatchObject({ detailPagesAttempted: 2, successfullyParsed: 1, transportFailures: 1, actualInserts: 1 });
    expect(testDb.database.prepare("SELECT COUNT(*) count FROM ingestion_items").get()).toEqual({ count: 2 });
  });

  it("rejects a detail whose canonical posting ID differs", async () => {
    const testDb = createTestDatabase(); databases.push(testDb);
    const candidate = collectionCandidate("50004001", 1);
    const mock = execution([page(1, [candidate])]);
    const result = await collectJobKoreaOnce({ searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI", pages: 1, maxDetails: 1, mode: "dry-run", confirm: true }, { database: testDb.database, createExecution: async () => mock, httpClient: http({ "50004001": html("50004002") }).client });
    expect(result.details[0]).toMatchObject({ status: "invalid_detail", parserResult: "failed", databaseAction: "not_stored" });
  });

  it("retains expired and explicitly closed valid postings as storable detail outcomes", async () => {
    const testDb = createTestDatabase(); databases.push(testDb);
    const candidates = [collectionCandidate("50005001", 1), collectionCandidate("50005002", 2)];
    const mock = execution([page(1, candidates)]);
    const result = await collectJobKoreaOnce({ searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI", pages: 1, maxDetails: 2, mode: "dry-run", confirm: true },
      { database: testDb.database, createExecution: async () => mock, httpClient: http({ "50005002": { html: html("50005002"), closed: true } }).client, now: () => new Date("2026-09-05T00:00:00Z") });
    expect(result.details.map((item) => item.status)).toEqual(["expired", "closed"]);
    expect(result.successfullyParsed).toBe(2);
  });
});
