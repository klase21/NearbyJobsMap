import { describe, expect, it } from "vitest";
import { buildJobKoreaListingPageResult, classifyJobKoreaRenderedPage } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { failedSearchPageResult } from "../../sources/jobkorea/transport/jobkorea-playwright-search";
import type { JobKoreaPageSnapshot } from "../../sources/jobkorea/transport/jobkorea-search-types";
import { jobKoreaCandidate as candidate, jobKoreaSnapshot as snapshot } from "./jobkorea-snapshot-test-factory";

describe("잡코리아 browser listing classification", () => {
  it("ordinary candidates를 source 순서와 canonical URL로 만든다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([candidate("11", { position: 1 }), candidate("12", { position: 2 })]), 1, new Set(), "2026-08-07T00:52:00.000Z");
    expect(result).toMatchObject({ classification: "valid_search_results", extractedCount: 2, ordinaryPostingCount: 2, validEmptyPage: false });
    expect(result.observedAt).toBe("2026-08-07T00:52:00.000Z");
    expect(result.candidates.map(({ sourcePostingId, listingPosition }) => [sourcePostingId, listingPosition])).toEqual([["11", 1], ["12", 2]]);
    expect(result.candidates[0]?.sourceUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/11");
  });

  it("페이지 내부 duplicate를 제거하되 empty로 만들지 않는다", () => {
    const result = buildJobKoreaListingPageResult(snapshot([candidate("11", { position: 1 }), candidate("11", { position: 2 })]), 1);
    expect(result).toMatchObject({ duplicateWithinPageCount: 1, validEmptyPage: false, ordinaryPostingCount: 2 });
  });

  it("global duplicate뿐인 page 2도 유효한 결과 페이지다", () => {
    const seen = new Set(["https://www.jobkorea.co.kr/Recruit/GI_Read/11"]);
    const result = buildJobKoreaListingPageResult(snapshot([candidate("11")], { finalUrl: "https://www.jobkorea.co.kr/Search?Page_No=2" }), 2, seen);
    expect(result).toMatchObject({ uniqueNewCount: 0, validEmptyPage: false, classification: "valid_search_results" });
  });

  it("explicit no-result만 valid empty로 분류한다", () => {
    const input = snapshot([], { evidence: { noResultMarkerCount: 1 } });
    expect(buildJobKoreaListingPageResult(input, 1)).toMatchObject({ classification: "valid_empty_results", validEmptyPage: true, parserFailure: false });
  });

  it.each([
    ["login_redirect", snapshot([], { evidence: { loginMarkerCount: 1 } })],
    ["captcha_page", snapshot([], { evidence: { captchaMarkerCount: 1 } })],
    ["verification_page", snapshot([], { evidence: { verificationMarkerCount: 1 } })],
    ["access_denied", snapshot([], { evidence: { accessDeniedMarkerCount: 1 } })],
    ["malformed_results", snapshot([], { evidence: { ordinaryContainerCount: 1 } })],
    ["unexpected_page", snapshot([])],
  ] as const)("%s 페이지를 empty로 오인하지 않는다", (classification, input) => {
    expect(classifyJobKoreaRenderedPage(input)).toBe(classification);
    expect(buildJobKoreaListingPageResult(input, 1).validEmptyPage).toBe(false);
  });

  it("snapshot 미완료와 timeout의 counts는 unknown null이다", () => {
    const incomplete = snapshot([], { extractionCompleted: false, extractionDurationMs: null, readiness: null, domChangedAfterReadiness: null,
      evidence: Object.fromEntries(Object.keys(snapshot([]).evidence).map((key) => [key, null])) as JobKoreaPageSnapshot["evidence"] });
    expect(buildJobKoreaListingPageResult(incomplete, 1)).toMatchObject({ classification: "malformed_results", extractedCount: null, ordinaryPostingCount: null });
    expect(failedSearchPageResult(1, "timeout", "JOBKOREA_PLAYWRIGHT_TIMEOUT"))
      .toMatchObject({ classification: "timeout", extractedCount: null, validEmptyPage: false, parserFailure: true });
  });
});
