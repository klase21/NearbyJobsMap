import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";
import { collectAlbamonOnce, selectAlbamonCandidates } from "../../sources/albamon/collection/albamon-collection-service";
import { parseAlbamonCollectionArgs } from "../../sources/albamon/collection/albamon-collection-cli";
import { ALBAMON_COLLECTION_PRESETS } from "../../sources/albamon/collection/albamon-collection-presets";
import { ALBAMON_LISTING_EVALUATOR_SOURCE, toAlbamonListingPageResult } from "../../sources/albamon/collection/albamon-listing-evaluator";
import type { AlbamonListingCandidate, AlbamonListingPageResult } from "../../sources/albamon/collection/albamon-collection-types";
import { buildAlbamonListingUrl, normalizeAlbamonDetailUrl, normalizeAlbamonListingUrl } from "../../sources/albamon/collection/albamon-url-policy";
import { classifyAlbamonNavigationFailure } from "../../sources/albamon/collection/albamon-listing-browser";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

const databases: TestDatabase[] = [];
afterEach(() => { while (databases.length) databases.pop()!.cleanup(); });

function candidate(id: string, position: number, regionText: string | null): AlbamonListingCandidate {
  return { sourcePostingId: id, canonicalUrl: `https://www.albamon.com/jobs/detail/${id}`, title: `공고 ${id}`, companyName: `회사 ${id}`,
    regionText, salaryText: "시급 12,000원", employmentTypes: ["아르바이트"], workDaysText: "주 5일", workHoursText: "09:00~18:00",
    postingDate: "오늘", deadlineText: "채용시 마감", categoryLabels: ["서비스"], firstSourcePosition: position, observedLinkCount: 2 };
}
function page(pageNumber: number, candidates: AlbamonListingCandidate[], overrides: Partial<AlbamonListingPageResult> = {}): AlbamonListingPageResult {
  return { pageNumber, requestedUrl: buildAlbamonListingUrl(pageNumber), finalUrl: buildAlbamonListingUrl(pageNumber), classification: "valid_results",
    extractedNumericLinkCount: candidates.reduce((sum, item) => sum + item.observedLinkCount, 0), uniquePostingIdCount: candidates.length,
    uniqueNewPostingIdCount: candidates.length, sourceReportsNoResults: false, blocked: false, parserFailure: false, validEmptyPage: false,
    candidates, diagnosticCodes: [], ...overrides };
}
async function evaluateHtml(html: string): Promise<unknown> {
  const browser = await chromium.launch({ headless: true });
  try { const page = await browser.newPage(); await page.setContent(html); return await page.evaluate(ALBAMON_LISTING_EVALUATOR_SOURCE); }
  finally { await browser.close(); }
}

describe("Albamon public URL policy and presets", () => {
  it("retains only bounded navigation failure categories", () => {
    expect(classifyAlbamonNavigationFailure(new Error("net::ERR_CERT_COMMON_NAME_INVALID private detail"))).toBe("ALBAMON_LISTING_TLS_FAILED");
    expect(classifyAlbamonNavigationFailure(new Error("Timeout 15000ms exceeded"))).toBe("ALBAMON_LISTING_NAVIGATION_TIMEOUT");
    expect(classifyAlbamonNavigationFailure(new Error("secret path"))).toBe("ALBAMON_LISTING_NAVIGATION_FAILED");
  });
  it("constructs explicit listing pages and strips detail tracking", () => {
    expect(buildAlbamonListingUrl(2)).toBe("https://www.albamon.com/jobs/total?page=2&sortType=POSTED_DATE&size=50&searchPeriodType=TODAY");
    expect(normalizeAlbamonListingUrl(buildAlbamonListingUrl(1))).toContain("/jobs/total?");
    expect(normalizeAlbamonDetailUrl("/jobs/detail/123456?tracking=secret")).toEqual({ postingId: "123456", canonicalUrl: "https://www.albamon.com/jobs/detail/123456" });
    for (const value of ["http://www.albamon.com/jobs/total", "https://evil.example/jobs/detail/1", "https://user:pass@www.albamon.com/jobs/detail/1", "/jobs/detail/not-id"]) expect(() => value.includes("total") ? normalizeAlbamonListingUrl(value) : normalizeAlbamonDetailUrl(value)).toThrow();
  });
  it("provides three bounded presets and only permits reductions", () => {
    expect(Object.keys(ALBAMON_COLLECTION_PRESETS)).toHaveLength(3);
    expect(ALBAMON_COLLECTION_PRESETS["albamon-capital-today"]).toMatchObject({ source: "albamon", regions: ["seoul", "gyeonggi"], pages: 5, maxDetails: 50, listingOnly: true });
    expect(parseAlbamonCollectionArgs(["--preset", "albamon-seoul-today", "--pages", "1", "--max-details", "5", "--dry-run", "--confirm"])).toMatchObject({ pages: 1, maxDetails: 5, mode: "dry-run" });
    expect(() => parseAlbamonCollectionArgs(["--preset", "albamon-seoul-today", "--pages", "4", "--dry-run", "--confirm"])).toThrow();
    expect(() => parseAlbamonCollectionArgs(["--preset", "unknown", "--dry-run", "--confirm"])).toThrow();
  });
});

describe("Albamon card-isolated evaluator", () => {
  it("extracts one record per card and collapses duplicate anchors without cross-card contamination", async () => {
    const raw = await evaluateHtml(`<!doctype html><main><ul class="job-list">
      <li><a href="/jobs/detail/10001">서울 매장 스태프</a><a href="/jobs/detail/10001">지원</a><span class="company">서울회사</span><span class="location">서울 강남구</span><span class="salary">시급 12,000원</span></li>
      <li><a href="/jobs/detail/10002">경기 물류 보조</a><span class="company">경기회사</span><span class="location">경기 성남시</span></li>
    </ul></main>`);
    const result = toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1));
    expect(result).toMatchObject({ classification: "valid_results", extractedNumericLinkCount: 3, uniquePostingIdCount: 2 });
    expect(result.candidates[0]).toMatchObject({ sourcePostingId: "10001", title: "서울 매장 스태프", companyName: "서울회사", regionText: "서울 강남구", observedLinkCount: 2 });
    expect(result.candidates[1]?.companyName).toBe("경기회사");
  });
  it("rejects page-level and mixed-ID containers and distinguishes explicit non-result states", async () => {
    const malformed = toAlbamonListingPageResult(await evaluateHtml(`<!doctype html><main><div><a href="/jobs/detail/1">A</a><a href="/jobs/detail/2">B</a><span class="company">회사</span></div></main>`), 1, buildAlbamonListingUrl(1));
    expect(malformed.classification).toBe("malformed"); expect(malformed.candidates).toHaveLength(0);
    expect(toAlbamonListingPageResult(await evaluateHtml(`<!doctype html><main>등록된 공고가 없습니다</main>`), 1, buildAlbamonListingUrl(1)).validEmptyPage).toBe(true);
  });
});

describe("Albamon bounded listing collection", () => {
  it("deduplicates in page/source order and filters regions before the candidate cap", () => {
    const selection = selectAlbamonCandidates([page(2, [candidate("3", 1, "서울 마포구")]), page(1, [candidate("1", 1, "부산"), candidate("2", 2, "경기 성남시"), candidate("3", 3, "서울 강남구"), candidate("4", 4, null)])], 2, ["seoul", "gyeonggi"]);
    expect(selection.candidates.map((item) => item.sourcePostingId)).toEqual(["2", "3"]);
    expect(selection).toMatchObject({ uniquePostingIds: 4, seoulMatches: 1, gyeonggiMatches: 1, unknownRegionCandidates: 1, excludedByRegion: 2 });
  });
  it("does not treat a duplicate-only page as empty and dry-run writes nothing", async () => {
    const db = createTestDatabase(); databases.push(db); const pages = [page(1, [candidate("10", 1, "서울 강남구")]), page(2, [candidate("10", 1, "서울 강남구")], { uniqueNewPostingIdCount: 0 })];
    const result = await collectAlbamonOnce({ presetId: "albamon-seoul-today", presetLabel: "알바몬 서울 오늘 등록", pages: 2, maxDetails: 5, mode: "dry-run", confirm: true, requestedRegions: ["seoul"] }, { database: db.database, collectPages: async () => pages });
    expect(pages[1]?.validEmptyPage).toBe(false); expect(result).toMatchObject({ listingPagesCompleted: 2, uniquePostingIds: 1, listingOnlyRecords: 1, predictedInserts: 1, actualInserts: 0, detailPagesAttempted: 0 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM jobs").get()).toEqual({ count: 0 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get()).toEqual({ count: 0 });
  });
  it("writes one item per selected candidate, is idempotent, and preserves listing provenance", async () => {
    const db = createTestDatabase(); databases.push(db); const pages = [page(1, [candidate("20", 1, "경기 수원시")])];
    const options = { presetId: "albamon-gyeonggi-today", presetLabel: "알바몬 경기 오늘 등록", pages: 1 as const, maxDetails: 1, mode: "write" as const, confirm: true as const, requestedRegions: ["gyeonggi"] as Array<"gyeonggi"> };
    const first = await collectAlbamonOnce(options, { database: db.database, collectPages: async () => pages });
    const second = await collectAlbamonOnce(options, { database: db.database, collectPages: async () => pages });
    expect(first.actualInserts).toBe(1); expect(second.actualUnchanged).toBe(1);
    expect(db.database.prepare("SELECT COUNT(*) count FROM jobs WHERE source='albamon' AND source_posting_id='20'").get()).toEqual({ count: 1 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM ingestion_items").get()).toEqual({ count: 2 });
    expect(db.database.prepare("SELECT observation_kind, detail_access_status FROM jobs WHERE source_posting_id='20'").get()).toEqual({ observation_kind: "bounded_listing_collection", detail_access_status: "not_attempted" });
  });
});
