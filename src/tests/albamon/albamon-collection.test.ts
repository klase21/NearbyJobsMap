import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";
import { collectAlbamonOnce, selectAlbamonCandidates } from "../../sources/albamon/collection/albamon-collection-service";
import { parseAlbamonCollectionArgs } from "../../sources/albamon/collection/albamon-collection-cli";
import { ALBAMON_COLLECTION_PRESETS } from "../../sources/albamon/collection/albamon-collection-presets";
import { ALBAMON_LISTING_EVALUATOR_SOURCE, toAlbamonListingPageResult } from "../../sources/albamon/collection/albamon-listing-evaluator";
import type { AlbamonListingCandidate, AlbamonListingPageResult } from "../../sources/albamon/collection/albamon-collection-types";
import { buildAlbamonListingUrl, normalizeAlbamonDetailUrl, normalizeAlbamonListingUrl } from "../../sources/albamon/collection/albamon-url-policy";
import { classifyAlbamonNavigationFailure, sanitizeAlbamonTransportError, settleAlbamonListingPage } from "../../sources/albamon/collection/albamon-listing-browser";
import { ALBAMON_AREA_CODE_BY_REGION, ALBAMON_CAPITAL_AREA_CODES, getAlbamonAreaCode } from "../../sources/albamon/collection/albamon-region-evidence";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { classifyPostingDateEvidence } from "../../services/collection-date";
import { normalizeAlbamon } from "../../sources/albamon/normalize";

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

interface VerifiedAlbamonRecord {
  recruitNo: number; recruitTitle: string; companyName: string; workplaceArea: string; workplaceAddress: string;
  latitude: number | null; longitude: number | null; pay: string; payType: { key: string; description: string };
  payAddTypes: Array<{ key: string; description: string }>; workingTime: string; workingPeriod: string; workingWeek: string;
  postedDate: string; closingDate: string; closingDateWithDDay: string; parts: Array<{ description: string }>;
  recruitType: { key: string; description: string };
}
function verifiedRecord(id: number, overrides: Partial<VerifiedAlbamonRecord> = {}): VerifiedAlbamonRecord {
  return { recruitNo: id, recruitTitle: `검증 공고 ${id}`, companyName: `검증 회사 ${id}`, workplaceArea: "서울 광진구",
    workplaceAddress: "서울 광진구 광나루로 19", latitude: 37.548218, longitude: 127.07298, pay: "2,830,000원",
    payType: { key: "MONTHLY_SALARY", description: "월급" }, payAddTypes: [], workingTime: "12:00~23:00",
    workingPeriod: "6개월~1년", workingWeek: "주5일", postedDate: "14분전", closingDate: "2026-08-12",
    closingDateWithDDay: "2026-08-12 (마감일 5일전)", parts: [{ description: "매장관리" }],
    recruitType: { key: "NORMAL", description: "일반 공고" }, ...overrides };
}
function verifiedHtml(records: VerifiedAlbamonRecord[]): string {
  const cards = records.map((record) => `<li class="ListItemRecruit_list-item-recruit__hash">
    <div class="list-item-recruit__contents list-item-recruit__contents--article">
      <a class="list-item-recruit__link--expand" href="/jobs/detail/${record.recruitNo}"><div class="list-item-recruit__recruit-title"><span class="typography-paid">${record.recruitTitle}</span></div></a>
      <div class="ListItemRecruit_list-item-recruit--company-group__hash"><a href="/company/fixture"><span class="ListItemRecruit_list-item-recruit__company-name__hash">${record.companyName}</span></a></div>
    </div>
    <div class="list-item-recruit__contents--keyword-area"><span>${record.workplaceArea}</span></div>
    <div class="list-item-recruit__contents--salary"><span class="list-item-recruit__salary">${record.pay}</span><span class="chip-content">${record.payType.description}</span></div>
    <div class="list-item-recruit__contents--time"><p>${record.workingTime}</p></div>
    <div class="list-item-recruit__contents--date"><span class="list-item-recruit__highlight">${record.postedDate}</span></div>
    <dl><dt>근무지</dt><dd class="list-item-recruit__work">${record.workplaceAddress}</dd><dt>마감일</dt><dd>${record.closingDate}</dd></dl>
    <a href="/jobs/detail/${record.recruitNo}">상세</a><a href="/jobs/detail/${record.recruitNo}">지원</a>
  </li>`).join("");
  const nextData = { props: { pageProps: { dehydratedState: { queries: [{ state: { data: { base: {
    normal: { collection: records }, pagination: { totalCount: records.length },
  } } } }] } } } };
  return `<!doctype html><main><div class="recruit-list-template__base-list"><ul>${cards}</ul></div></main><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
}

describe("Albamon public URL policy and presets", () => {
  it("retains only bounded navigation failure categories", () => {
    expect(classifyAlbamonNavigationFailure(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe("ALBAMON_LISTING_DNS_FAILED");
    expect(classifyAlbamonNavigationFailure(new Error("net::ERR_CERT_COMMON_NAME_INVALID private detail"))).toBe("ALBAMON_LISTING_TLS_FAILED");
    expect(classifyAlbamonNavigationFailure(new Error("Timeout 15000ms exceeded"))).toBe("ALBAMON_LISTING_NAVIGATION_TIMEOUT");
    expect(classifyAlbamonNavigationFailure(new Error("secret path"))).toBe("ALBAMON_LISTING_NAVIGATION_FAILED");
    expect(sanitizeAlbamonTransportError(new Error("failed at C:\\Users\\sample\\profile data")).message).toBe("failed at <LOCAL_PATH> data");
  });
  it("constructs explicit listing pages and strips detail tracking", () => {
    expect(buildAlbamonListingUrl(2)).toBe("https://www.albamon.com/jobs/total?page=2&sortType=POSTED_DATE&size=50&searchPeriodType=TODAY&excludeBar=true");
    expect(normalizeAlbamonListingUrl(buildAlbamonListingUrl(1))).toContain("/jobs/total?");
    expect(normalizeAlbamonListingUrl("https://m.albamon.com/jobs/total?page=1")).toBe("https://m.albamon.com/jobs/total?page=1");
    expect(normalizeAlbamonDetailUrl("/jobs/detail/123456?tracking=secret")).toEqual({ postingId: "123456", canonicalUrl: "https://www.albamon.com/jobs/detail/123456" });
    expect(ALBAMON_AREA_CODE_BY_REGION).toEqual({ seoul: "I000", gyeonggi: "B000" });
    expect(buildAlbamonListingUrl(2, getAlbamonAreaCode("seoul"))).toBe("https://www.albamon.com/jobs/total?page=2&sortType=POSTED_DATE&size=50&searchPeriodType=TODAY&excludeBar=true&areas=I000");
    expect(buildAlbamonListingUrl(1, getAlbamonAreaCode("gyeonggi"))).toContain("areas=B000");
    expect(new URL(buildAlbamonListingUrl(1, "I000")).searchParams.getAll("areas")).toEqual(["I000"]);
    expect(new URL(buildAlbamonListingUrl(50, ALBAMON_CAPITAL_AREA_CODES, 50)).searchParams.get("areas")).toBe("I000,B000");
    expect(() => getAlbamonAreaCode("other" as never)).toThrow("ALBAMON_REGION_MAPPING_UNKNOWN");
    for (const value of ["http://www.albamon.com/jobs/total", "https://evil.example/jobs/detail/1", "https://user:pass@www.albamon.com/jobs/detail/1", "/jobs/detail/not-id"]) expect(() => value.includes("total") ? normalizeAlbamonListingUrl(value) : normalizeAlbamonDetailUrl(value)).toThrow();
  });
  it("provides three bounded presets and only permits reductions", () => {
    expect(Object.keys(ALBAMON_COLLECTION_PRESETS)).toHaveLength(3);
    expect(ALBAMON_COLLECTION_PRESETS["albamon-capital-today"]).toMatchObject({ source: "albamon", regions: ["seoul", "gyeonggi"], pages: 5, maxDetails: 50, listingOnly: true });
    expect(parseAlbamonCollectionArgs(["--preset", "albamon-seoul-today", "--pages", "1", "--max-details", "5", "--dry-run", "--confirm"])).toMatchObject({ pages: 1, maxDetails: 5, mode: "dry-run" });
    expect(parseAlbamonCollectionArgs(["--preset", "albamon-seoul-today", "--pages", "1", "--max-details", "5", "--dry-run", "--confirm", "--diagnostic"]).diagnostic).toBe(true);
    expect(() => parseAlbamonCollectionArgs(["--preset", "albamon-seoul-today", "--pages", "4", "--dry-run", "--confirm"])).toThrow();
    expect(() => parseAlbamonCollectionArgs(["--preset", "unknown", "--dry-run", "--confirm"])).toThrow();
  });
});

describe("Albamon card-isolated evaluator", () => {
  it("binds the verified outer card to its same-identity structured record and recovers listing metadata", async () => {
    const records = [
      verifiedRecord(91001),
      verifiedRecord(91002, { workplaceArea: "경기 안양시", workplaceAddress: "경기 안양시 만안구 안양로 1", latitude: 37.39, longitude: 126.92,
        pay: "10,320원", payType: { key: "HOURLY_WAGE", description: "시급" }, workingWeek: "주2일", workingTime: "시간협의" }),
      verifiedRecord(91003, { workplaceArea: "서울 강서구", workplaceAddress: "경기 양주시 백석읍 중앙로 1", latitude: 37.8, longitude: 126.96,
        pay: "144,720원", payType: { key: "DAILY_WAGE", description: "일급" }, payAddTypes: [{ key: "PAY_THE_DAY", description: "당일지급" }],
        closingDate: "상시모집", closingDateWithDDay: "상시모집" }),
      verifiedRecord(91004, { pay: "3,050,000원", payType: { key: "UNVERIFIED", description: "기타" }, latitude: null, longitude: null }),
    ];
    const result = toAlbamonListingPageResult(await evaluateHtml(verifiedHtml(records)), 1, buildAlbamonListingUrl(1, "I000,B000", 100));
    expect(result).toMatchObject({ classification: "valid_results", extractedNumericLinkCount: 12, uniquePostingIdCount: 4, invalidCardCount: 0 });
    expect(result.candidates[0]).toMatchObject({ sourcePostingId: "91001", title: "검증 공고 91001", companyName: "검증 회사 91001",
      regionText: "서울 광진구", workplaceAddress: "서울 광진구 광나루로 19", latitude: 37.548218, longitude: 127.07298,
      salaryText: "2,830,000원", payType: "monthly", workPeriodText: "6개월~1년", workDaysText: "주5일", workHoursText: "12:00~23:00",
      postingDate: "14분전", deadlineText: "2026-08-12", categoryLabels: ["매장관리"], employmentTypes: [] });
    expect(result.candidates[2]).toMatchObject({ salaryText: "144,720원", payType: "daily", payTheDay: true, deadlineText: "상시모집" });
    expect(result.candidates[3]).toMatchObject({ salaryText: "3,050,000원", payType: null, latitude: null, longitude: null });
  });
  it("rejects a DOM identity missing from a structured listing page instead of cross-binding records", async () => {
    const record = verifiedRecord(92001);
    const html = verifiedHtml([record]).replaceAll("/jobs/detail/92001", "/jobs/detail/92002");
    const result = toAlbamonListingPageResult(await evaluateHtml(html), 1, buildAlbamonListingUrl(1, "I000,B000", 100));
    expect(result).toMatchObject({ classification: "malformed", uniquePostingIdCount: 0, invalidCardCount: 1 });
  });
  it("preserves the verified 50-card to 50-identity contract", async () => {
    const records = Array.from({ length: 50 }, (_, index) => verifiedRecord(93000 + index));
    const result = toAlbamonListingPageResult(await evaluateHtml(verifiedHtml(records)), 1, buildAlbamonListingUrl(1, "I000,B000", 100));
    expect(result).toMatchObject({ classification: "valid_results", extractedNumericLinkCount: 150, uniquePostingIdCount: 50, sourceTotalCount: 50 });
    expect(new Set(result.candidates.map((item) => item.sourcePostingId)).size).toBe(50);
  });
  it("uses payType for structured units, keeps badges separate, and suppresses conflicted coordinates", async () => {
    const raw = await evaluateHtml(verifiedHtml([
      verifiedRecord(94001),
      verifiedRecord(94002, { workplaceArea: "경기 안양시", workplaceAddress: "경기 안양시 만안구 안양로 1", pay: "10,320원", payType: { key: "HOURLY_WAGE", description: "시급" } }),
      verifiedRecord(94003, { workplaceArea: "서울 강서구", workplaceAddress: "경기 양주시 백석읍 중앙로 1", pay: "144,720원", payType: { key: "DAILY_WAGE", description: "일급" },
        payAddTypes: [{ key: "PAY_THE_DAY", description: "당일지급" }] }),
      verifiedRecord(94004, { pay: "당일지급", payType: { key: "UNVERIFIED", description: "기타" }, payAddTypes: [{ key: "PAY_THE_DAY", description: "당일지급" }] }),
    ]));
    const parsedPage = toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1, "I000,B000", 100));
    parsedPage.sourceFilterRegions = ["seoul", "gyeonggi"]; parsedPage.sourceAreaCode = "I000,B000";
    const selection = selectAlbamonCandidates([parsedPage], 10, ["seoul", "gyeonggi"]);
    expect(selection).toMatchObject({ seoulMatches: 2, gyeonggiMatches: 1, capitalScopeMatches: 1, regionConflicts: 1 });
    const jobs = selection.candidates.map((item) => normalizeAlbamon({ sourcePostingId: item.sourcePostingId, sourceUrl: item.canonicalUrl,
      title: item.title, companyName: item.companyName, salaryText: item.salaryText, salaryFromStructured: item.salaryFromStructured === true,
      payType: item.payType ?? null, regionText: item.regionText, workplaceAddress: item.workplaceAddress ?? null, latitude: item.latitude ?? null, longitude: item.longitude ?? null,
      regionConflict: item.regionConflict === true, workDaysText: item.workDaysText, workHoursText: item.workHoursText, employmentTypes: item.employmentTypes,
      deadlineText: item.deadlineText, promoted: null, capturedAt: "2026-08-07T01:00:00.000Z" }));
    expect(jobs.map((job) => [job.salary.type, job.salary.minimumAmount])).toEqual([["monthly", 2_830_000], ["hourly", 10_320], ["daily", 144_720], ["unknown", null]]);
    expect(jobs[2]).toMatchObject({ city: null, district: null, latitude: null, longitude: null, expiresAt: "2026-08-12" });
    expect(parsedPage.candidates[2]).toMatchObject({ payTheDay: true, salaryText: "144,720원" });
    expect(parsedPage.candidates[3]).toMatchObject({ payTheDay: true, salaryText: null, salaryCandidateRejected: true });
    expect(jobs.every((job) => job.employmentTypes.length === 0)).toBe(true);
  });
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
  }, 10_000);
  it("ignores hidden no-result templates when an active result region has cards", async () => {
    const raw = await evaluateHtml(`<!doctype html><div class="no-result" hidden>검색 결과가 없습니다</div><main><ul class="job-list">
      <li><a href="/jobs/detail/20001">서울 운영 보조</a><span class="company">새봄데이터</span><span class="location">서울 강남구</span></li>
      <li><a href="/jobs/detail/20002">경기 데이터 정리</a><span class="company">한빛로컬랩</span><span class="location">경기 성남시</span></li>
    </ul></main>`);
    expect(toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1))).toMatchObject({ classification: "valid_results", validEmptyPage: false, uniquePostingIdCount: 2 });
  });
  it("does not infer a missing location from region words in the title or company", async () => {
    const raw = await evaluateHtml(`<!doctype html><main><ul class="job-list">
      <li><a href="/jobs/detail/21001">서울 강서구 매장 운영</a><span class="company">서울서비스</span></li>
      <li><a href="/jobs/detail/21002">일반 운영 보조</a><span class="company">한빛로컬랩</span></li>
    </ul></main>`);
    expect(toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1)).candidates[0]?.regionText).toBeNull();
  });
  it("accepts only a dedicated location field and rejects title-parent contamination", async () => {
    const raw = await evaluateHtml(`<!doctype html><main><ul class="job-list">
      <li><div class="location"><a href="/jobs/detail/22001">서울 운영 보조</a><span class="company">새봄데이터</span></div></li>
      <li><a href="/jobs/detail/22002">데이터 정리</a><span class="company">한빛로컬랩</span><span class="workplace-location">서울 마포구</span></li>
    </ul></main>`);
    const result = toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1));
    expect(result.candidates[0]).toMatchObject({ regionText: null, locationContaminationRejected: true });
    expect(result.candidates[1]).toMatchObject({ regionText: "서울 마포구", locationContaminationRejected: false });
  });
  it.each(["오늘", "방금", "9분 전", "2시간 전", "08.07", "어제"])("extracts historical registered field value %s without changing other fields", async (rawDate) => {
    const raw = await evaluateHtml(`<!doctype html><main><ul class="job-list">
      <li><a href="/jobs/detail/23001">서울 운영 보조</a><a href="/jobs/detail/23001">지원</a><span class="company">새봄데이터</span><span class="location">서울 강남구</span><span class="salary">시급 12,000원</span><span class="registered">${rawDate}</span><span class="deadline">08.20</span></li>
      <li><a href="/jobs/detail/23002">다른 공고</a><span class="company">한빛로컬랩</span></li>
    </ul></main>`);
    const result = toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1));
    expect(result.candidates[0]).toMatchObject({ postingDate: rawDate, postingDateEvidence: { raw: rawDate, sourceField: "listing_registered" }, regionText: "서울 강남구", salaryText: "시급 12,000원", deadlineText: "08.20", observedLinkCount: 2 });
    expect(classifyPostingDateEvidence(result.candidates[0]?.postingDateEvidence?.raw, "2026-08-07").status).toBe(rawDate === "어제" ? "older" : "today");
  });
  it("keeps registered and deadline fields separate and rejects deadline-only or unrelated dates", async () => {
    const raw = await evaluateHtml(`<!doctype html><main><ul class="job-list">
      <li><a href="/jobs/detail/24001">등록과 마감</a><span class="company">새봄데이터</span><dl><dt>등록</dt><dd>08.07</dd><dt>마감</dt><dd class="deadline">08.20</dd></dl></li>
      <li><a href="/jobs/detail/24002">마감만 있음</a><span class="company">한빛로컬랩</span><span class="deadline">오늘</span><span>2024.01.01</span></li>
    </ul></main>`);
    const result = toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1));
    expect(result.candidates[0]?.postingDateEvidence).toMatchObject({ raw: "08.07", sourceField: "listing_registered" });
    expect(result.candidates[1]).toMatchObject({ postingDate: null, postingDateEvidence: null, deadlineText: "오늘" });
  });
  it("uses bounded scrolling and stops after the card count stabilizes", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><main><ul class="job-list"><li><a href="/jobs/detail/30001">서울 운영</a><span class="company">새봄데이터</span></li></ul></main><script>
        let appended=false; window.scrollTo=()=>{if(appended)return;appended=true;document.querySelector('ul').insertAdjacentHTML('beforeend','<li><a href="/jobs/detail/30002">경기 운영</a><span class="company">한빛로컬랩</span></li>')};
      </script>`);
      const raw = await settleAlbamonListingPage(page);
      expect(toAlbamonListingPageResult(raw, 1, buildAlbamonListingUrl(1)).uniquePostingIdCount).toBe(2);
    } finally { await browser.close(); }
  });
});

describe("Albamon bounded listing collection", () => {
  it("deduplicates in page/source order and filters regions before the candidate cap", () => {
    const selection = selectAlbamonCandidates([page(2, [candidate("3", 1, "서울 마포구")]), page(1, [candidate("1", 1, "부산"), candidate("2", 2, "경기 성남시"), candidate("3", 3, "서울 강남구"), candidate("4", 4, null)])], 2, ["seoul", "gyeonggi"]);
    expect(selection.candidates.map((item) => item.sourcePostingId)).toEqual(["2", "3"]);
    expect(selection).toMatchObject({ uniquePostingIds: 4, seoulMatches: 1, gyeonggiMatches: 1, unknownRegionCandidates: 1, excludedByRegion: 2 });
  });
  it("uses verified source-filter evidence for null locations and rejects contradictory displayed regions before the cap", () => {
    const sourcePage = page(1, [candidate("30", 1, null), candidate("31", 2, "경기 성남시"), candidate("32", 3, "서울 마포구")], {
      sourceFilterRegion: "seoul", sourceAreaCode: "I000",
    });
    const selection = selectAlbamonCandidates([sourcePage], 2, ["seoul"]);
    expect(selection.candidates.map((item) => item.sourcePostingId)).toEqual(["30", "32"]);
    expect(selection.candidates[0]).toMatchObject({ normalizedRegions: ["seoul"], regionConfidence: "exact_source_filter", regionEvidenceSource: "source_filter", sourceAreaCode: "I000", regionText: null });
    expect(selection).toMatchObject({ sourceFilterOnlyRecords: 1, displayedLocationRecords: 2, regionConflicts: 1, excludedByRegion: 1 });
  });
  it("uses the combined capital TODAY source filter without requiring card dates or addresses", async () => {
    const db = createTestDatabase(); databases.push(db);
    const withoutEnrichment = { ...candidate("35", 1, null), postingDate: null, postingDateEvidence: null };
    const pages = [page(1, [withoutEnrichment], { sourceFilterRegions: ["seoul", "gyeonggi"], sourceAreaCode: "I000,B000" })];
    const result = await collectAlbamonOnce({ presetId: "albamon-capital-today", presetLabel: "알바몬 서울·경기 오늘 등록", pages: 1,
      maxDetails: 10, mode: "dry-run", confirm: true, requestedRegions: ["seoul", "gyeonggi"], localTodayMode: true,
      collectionDate: { timezone: "Asia/Seoul", resolvedDate: "2026-08-07" } }, { database: db.database, collectPages: async () => pages });
    expect(result).toMatchObject({ candidatesSelected: 1, sourceFilterTodayEligible: 1, registeredMetadataRecords: 0,
      sourceFilterOnlyRecords: 1, predictedInserts: 1, actualInserts: 0 });
    expect(result.pageResults[0]?.candidates[0]).toMatchObject({ regionText: null, postingDate: null });
    const selection = selectAlbamonCandidates(pages, 10, ["seoul", "gyeonggi"]);
    expect(selection.candidates[0]).toMatchObject({ normalizedRegions: ["capital_scope"], regionEvidenceSource: "source_filter", sourceAreaCode: "I000,B000" });
    expect(selection).toMatchObject({ seoulMatches: 0, gyeonggiMatches: 0, multipleRegionMatches: 0, sourceFilterOnlyRecords: 1 });
  });
  it("keeps all pay types in the Albamon ALL-period personal profile and applies configured exclusions before the cap", async () => {
    const db = createTestDatabase(); databases.push(db);
    const monthly = { ...candidate("351", 1, "서울 강남구"), salaryText: "2,800,000원", salaryFromStructured: true, payType: "monthly" as const };
    const hourly = { ...candidate("352", 2, "경기 성남시"), salaryText: "12,000원", salaryFromStructured: true, payType: "hourly" as const };
    const daily = { ...candidate("353", 3, "서울 마포구"), salaryText: "150,000원", salaryFromStructured: true, payType: "daily" as const };
    const excluded = { ...candidate("354", 4, "서울 송파구"), title: "강사 모집", salaryText: "3,000,000원", salaryFromStructured: true, payType: "monthly" as const };
    const pages = [page(1, [monthly, hourly, daily, excluded], { sourceFilterRegions: ["seoul", "gyeonggi"], sourceAreaCode: "I000,B000", sourceTotalCount: 4 })];
    let received: { historicalMode?: boolean; cutoffDate?: string; exclusionKeywords?: string[] } | undefined;
    const result = await collectAlbamonOnce({ presetId: "albamon-capital-all", presetLabel: "알바몬 내 검색조건 전체", pages: 150,
      maxDetails: 7_500, mode: "dry-run", confirm: true, requestedRegions: ["seoul", "gyeonggi"], personalProfileBackfill: true,
      exclusion: { keywords: ["강사"], fields: ["title"] } }, { database: db.database, collectPages: async (_pages, options) => { received = options; return pages; } });
    expect(received).toMatchObject({ historicalMode: true, exclusionKeywords: ["강사"] });
    expect(received?.cutoffDate).toBeUndefined();
    expect(result).toMatchObject({ keyword: "내 검색조건 전체", candidatesSelected: 3, candidatesExcluded: 1,
      monthlyStructuredSalary: 1, hourlyStructuredSalary: 1, dailyStructuredSalary: 1, sourceTotalCount: 4 });
    expect(result.pageResults.flatMap((item) => item.candidates).map((item) => item.payType)).toEqual(["monthly", "hourly", "daily", "monthly"]);
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
  it("persists source-filter evidence separately while leaving original location null", async () => {
    const db = createTestDatabase(); databases.push(db);
    const pages = [page(1, [candidate("40", 1, null)], { sourceFilterRegion: "seoul", sourceAreaCode: "I000" })];
    const options = { presetId: "albamon-seoul-today", presetLabel: "알바몬 서울 오늘 등록", pages: 1 as const, maxDetails: 1,
      mode: "write" as const, confirm: true as const, requestedRegions: ["seoul"] as Array<"seoul"> };
    const first = await collectAlbamonOnce(options, { database: db.database, collectPages: async () => pages });
    const second = await collectAlbamonOnce(options, { database: db.database, collectPages: async () => pages });
    expect(first.actualInserts).toBe(1); expect(second.actualUnchanged).toBe(1);
    expect(db.database.prepare("SELECT address_original_text, normalized_regions_json, region_normalization_confidence, region_evidence_source, source_area_code, displayed_location_present FROM jobs WHERE source_posting_id=?").get("40"))
      .toEqual({ address_original_text: null, normalized_regions_json: '["seoul"]', region_normalization_confidence: "exact_source_filter", region_evidence_source: "source_filter", source_area_code: "I000", displayed_location_present: 0 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM job_observations WHERE job_id=?").get("albamon:40")).toEqual({ count: 2 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM job_provenance_history WHERE job_id=? AND region_evidence_source='source_filter' AND source_area_code='I000'").get("albamon:40")).toEqual({ count: 1 });
    const displayedPages = [page(1, [candidate("40", 1, "서울 마포구")], { sourceFilterRegion: "seoul", sourceAreaCode: "I000" })];
    const third = await collectAlbamonOnce(options, { database: db.database, collectPages: async () => displayedPages });
    expect(third.actualUpdates).toBe(1);
    expect(db.database.prepare("SELECT address_original_text, region_evidence_source, displayed_location_present FROM jobs WHERE source_posting_id=?").get("40"))
      .toEqual({ address_original_text: "서울 마포구", region_evidence_source: "displayed_location", displayed_location_present: 1 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM job_change_events WHERE job_id=?").get("albamon:40")).toEqual({ count: 1 });
  });
  it("does not create a job for a source-filter conflict", async () => {
    const db = createTestDatabase(); databases.push(db);
    const pages = [page(1, [candidate("50", 1, "경기 성남시")], { sourceFilterRegion: "seoul", sourceAreaCode: "I000" })];
    const result = await collectAlbamonOnce({ presetId: "albamon-seoul-today", presetLabel: "알바몬 서울 오늘 등록", pages: 1, maxDetails: 1,
      mode: "write", confirm: true, requestedRegions: ["seoul"] }, { database: db.database, collectPages: async () => pages });
    expect(result).toMatchObject({ regionConflicts: 1, candidatesSelected: 0, actualInserts: 0 });
    expect(db.database.prepare("SELECT COUNT(*) count FROM jobs").get()).toEqual({ count: 0 });
  });
});
