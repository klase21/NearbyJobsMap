import { describe, expect, it } from "vitest";
import { buildJobKoreaListingPageResult, classifyJobKoreaRenderedPage } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { failedSearchPageResult } from "../../sources/jobkorea/transport/jobkorea-playwright-search";
import type { JobKoreaRenderedAnchor, JobKoreaRenderedPageSnapshot } from "../../sources/jobkorea/transport/jobkorea-search-types";

const anchor = (id: string, overrides: Partial<JobKoreaRenderedAnchor> = {}): JobKoreaRenderedAnchor => ({ href: `/Recruit/GI_Read/${id}?logpath=x`, title: `공고 ${id}`,
  companyName: `회사 ${id}`, containerText: `회사 ${id} 공고`, dataGno: id, ordinaryContainer: true,
  promotedEvidence: false, recommendationEvidence: false, ...overrides });
const snapshot = (anchors: JobKoreaRenderedAnchor[], overrides: Partial<JobKoreaRenderedPageSnapshot> = {}): JobKoreaRenderedPageSnapshot => ({
  finalUrl: "https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", title: "검색", bodyText: "채용 검색 결과", anchors,
  sourceReportsNoResults: false, directObservation: null, ...overrides,
});

describe("잡코리아 browser listing extraction", () => {
  it("ordinary container의 상대 URL·ID를 source 순서로 정규화한다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([anchor("11"), anchor("12")]), 1);
    expect(result).toMatchObject({ classification: "valid_search_results", extractedCount: 2, ordinaryPostingCount: 2, validEmptyPage: false });
    expect(result.candidates.map(({ sourcePostingId, listingPosition }) => [sourcePostingId, listingPosition])).toEqual([["11", 1], ["12", 2]]);
    expect(result.candidates[0]?.sourceUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/11");
  });
  it("AD·추천·unrelated 영역을 일반 공고에서 분리한다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([anchor("11"), anchor("12", { promotedEvidence: true }),
      anchor("13", { recommendationEvidence: true }), anchor("14", { ordinaryContainer: false })]), 1);
    expect(result).toMatchObject({ ordinaryPostingCount: 1, promotedPostingCount: 1, rejectedCandidateCount: 2 });
    expect(result.candidates.map(({ sourcePostingId }) => sourcePostingId)).toEqual(["11"]);
  });
  it("페이지 내부 duplicate를 제거하되 페이지를 empty로 만들지 않는다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([anchor("11"), anchor("11")]), 1);
    expect(result).toMatchObject({ duplicateWithinPageCount: 1, validEmptyPage: false, ordinaryPostingCount: 2 });
  });
  it("global duplicate뿐인 page 2도 유효한 결과 페이지다", () => {
    const seen = new Set(["https://www.jobkorea.co.kr/Recruit/GI_Read/11"]);
    const result = buildJobKoreaListingPageResult(snapshot([anchor("11")], { finalUrl: "https://www.jobkorea.co.kr/Search?Page_No=2" }), 2, seen);
    expect(result).toMatchObject({ uniqueNewCount: 0, validEmptyPage: false, classification: "valid_search_results" });
  });
  it("source의 명시적 no-result만 valid empty로 분류한다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([], { bodyText: "검색 결과가 없습니다", sourceReportsNoResults: true }), 1);
    expect(result).toMatchObject({ classification: "valid_empty_results", validEmptyPage: true, parserFailure: false });
  });
  it.each([
    ["login_redirect", snapshot([], { finalUrl: "https://www.jobkorea.co.kr/Login", bodyText: "로그인이 필요합니다" })],
    ["root_redirect", snapshot([], { finalUrl: "https://www.jobkorea.co.kr/" })],
    ["captcha_page", snapshot([], { bodyText: "CAPTCHA 자동입력 방지" })],
    ["verification_page", snapshot([], { bodyText: "보안 확인 verification" })],
    ["access_denied", snapshot([], { bodyText: "Access Denied" })],
    ["malformed_results", snapshot([anchor("11", { ordinaryContainer: false })])],
    ["unexpected_page", snapshot([])],
  ])("%s 페이지를 empty로 오인하지 않는다", (classification, input) => {
    expect(classifyJobKoreaRenderedPage(input)).toBe(classification);
    expect(buildJobKoreaListingPageResult(input, 1).validEmptyPage).toBe(false);
  });
  it("timeout은 empty가 아니라 parser failure다", () => expect(failedSearchPageResult(1, "timeout", "JOBKOREA_PLAYWRIGHT_TIMEOUT"))
    .toMatchObject({ classification: "timeout", validEmptyPage: false, parserFailure: true }));
});
