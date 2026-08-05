import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { buildJobKoreaListingPageResult, classifyJobKoreaRenderedPage } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { captureJobKoreaPageSnapshot } from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import { syntheticJobKoreaPages } from "./jobkorea-synthetic-pages";

let browser: Browser;
let context: BrowserContext;
let externalRequests = 0;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ serviceWorkers: "block" });
  await context.route(/^https?:/i, (route) => { externalRequests += 1; return route.abort(); });
});

afterAll(async () => {
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
  await browser.close();
  expect(externalRequests).toBe(0);
}, 5_000);

async function snapshot(html: string) {
  const page: Page = await context.newPage();
  try {
    await page.setContent(html);
    return await captureJobKoreaPageSnapshot(page);
  } finally { await page.close(); }
}

describe("잡코리아 synthetic page snapshot browser boundary", () => {
  it("local data navigation → snapshot → classification 경계를 통과한다", async () => {
    const page = await context.newPage();
    try {
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(syntheticJobKoreaPages.validSearch)}`);
      const value = await captureJobKoreaPageSnapshot(page);
      expect(buildJobKoreaListingPageResult(value, 1)).toMatchObject({ classification: "valid_search_results", ordinaryPostingCount: 2 });
    } finally { await page.close(); }
  });

  it("ordinary row를 plain snapshot으로 만들고 source 순서를 유지한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.validSearch);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    expect(value).toMatchObject({ schemaVersion: 1, extractionCompleted: true,
      evidence: { ordinaryDetailLinkCount: 2, allNumericDetailLinkCount: 2 } });
    expect(value.ordinaryCandidates.map(({ postingId }) => postingId)).toEqual(["50000001", "50000002"]);
    expect(value.ordinaryCandidates[0]?.href).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/50000001");
  });

  it("ordinary·AD·추천·영역 밖 링크를 분리한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.promotedAndOrdinary);
    const result = buildJobKoreaListingPageResult(value, 1);
    expect(result).toMatchObject({ classification: "valid_search_results", ordinaryPostingCount: 1,
      promotedPostingCount: 1, rejectedCandidateCount: 2 });
    expect(result.candidates.map(({ sourcePostingId }) => sourcePostingId)).toEqual(["50000001"]);
  });

  it("relative·absolute·tracking URL의 동일 ID를 canonical URL로 중복 제거한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.duplicates);
    const result = buildJobKoreaListingPageResult(value, 1);
    expect(result).toMatchObject({ extractedCount: 3, ordinaryPostingCount: 3, duplicateWithinPageCount: 2 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.sourceUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/50000001");
  });

  it("source no-result evidence만 valid empty로 분류한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.validEmpty);
    expect(buildJobKoreaListingPageResult(value, 1)).toMatchObject({ classification: "valid_empty_results",
      sourceReportsNoResults: true, extractedCount: 0, ordinaryPostingCount: 0, validEmptyPage: true });
  });

  it.each([
    ["login_redirect", syntheticJobKoreaPages.login],
    ["captcha_page", syntheticJobKoreaPages.captcha],
    ["verification_page", syntheticJobKoreaPages.verification],
    ["access_denied", syntheticJobKoreaPages.accessDenied],
  ] as const)("%s는 empty가 아니며 candidate counts를 측정값처럼 노출하지 않는다", async (classification, html) => {
    const value = await snapshot(html);
    const result = buildJobKoreaListingPageResult(value, 1);
    expect(result).toMatchObject({ classification, extractedCount: null, ordinaryPostingCount: null,
      promotedPostingCount: null, rejectedCandidateCount: null, validEmptyPage: false });
  });

  it("recommendation-only numeric links를 ordinary result로 분류하지 않는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.recommendationOnly);
    expect(value.evidence.allNumericDetailLinkCount).toBe(2);
    expect(value.ordinaryCandidates).toHaveLength(0);
    expect(value.rejectedCandidates).toHaveLength(2);
    expect(classifyJobKoreaRenderedPage(value)).toBe("malformed_results");
  });

  it("malformed result container는 진단 가능한 measured zero이며 empty가 아니다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.malformedResults);
    const result = buildJobKoreaListingPageResult(value, 1);
    expect(result).toMatchObject({ classification: "malformed_results", ordinaryPostingCount: 0,
      rejectedCandidateCount: 1, validEmptyPage: false });
  });

  it("SVGAnimatedString href를 반환하지 않고 non-HTML anchor를 명시적으로 제외한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.nonHtmlAnchor);
    expect(value.rejectedCandidates).toEqual([{ href: "/Recruit/GI_Read/50000006", reason: "non_html_anchor" }]);
    expect(value.diagnostics).toContainEqual({ code: "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE",
      message: "HTMLAnchorElement가 아닌 detail-link 모양 요소를 제외했습니다." });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
