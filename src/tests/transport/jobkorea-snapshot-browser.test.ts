import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { buildJobKoreaListingPageResult, classifyJobKoreaRenderedPage } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { captureJobKoreaPageSnapshot, captureJobKoreaReadinessEvidence } from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
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
    expect(value).toMatchObject({ schemaVersion: 2, extractionCompleted: true, documentReadyState: "complete",
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
    expect(value.shadowStructure.provisionalPostingGroupCount).toBe(0);
  });

  it("SVGAnimatedString href를 반환하지 않고 non-HTML anchor를 명시적으로 제외한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.nonHtmlAnchor);
    expect(value.rejectedCandidates).toEqual([{ postingId: null, href: "/Recruit/GI_Read/50000006", reason: "SVG_ANCHOR_UNSUPPORTED" }]);
    expect(value.rejectionReasonCounts).toEqual({ SVG_ANCHOR_UNSUPPORTED: 1 });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  it.each([
    ["newCardBased", "article", "recruit-card"],
    ["listItemBased", "li", "job-item"],
    ["genericNestedDiv", "div", "unknown-card"],
  ] as const)("%s unknown container를 selector로 승인하지 않고 minimal signature로 설명한다", async (key, tag, className) => {
    const value = await snapshot(syntheticJobKoreaPages[key]);
    expect(classifyJobKoreaRenderedPage(value)).toBe("malformed_results");
    expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 1 });
    expect(value.containerSignatures[0]).toMatchObject({ count: 1, signature: { tag, classes: [className] } });
    const sample = value.diagnosticSamples.rejected[0]!;
    expect(sample.ancestors.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(sample)).not.toContain("가상");
    expect(JSON.stringify(sample)).not.toMatch(/innerHTML|outerHTML|textContent/);
  });

  it("promoted card는 unknown rejection aggregate와 섞지 않는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.promotedAndUnknownCards);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 2, promotedDetailLinkCount: 1, rejectedDetailLinkCount: 1 });
    expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 1 });
    expect(value.diagnosticSamples.promoted).toHaveLength(1);
  });

  it("legacy class substring matcher의 실제 generic false positive를 재현하고 corrected evaluator는 모두 거부한다", async () => {
    const page = await context.newPage();
    try {
      await page.setContent(syntheticJobKoreaPages.genericPromotionFalsePositives);
      const legacyCount = await page.evaluate(`document.querySelectorAll("[class*='ad']").length`);
      expect(legacyCount).toBe(7);
      const value = await captureJobKoreaPageSnapshot(page);
      expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 13, promotedDetailLinkCount: 0,
        rejectedDetailLinkCount: 13, promotedContainerCount: 0 });
      expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 13 });
      expect(value.promotionSignalCounts).toEqual({});
      expect(value.diagnosticSamples.rejected.every(({ insidePromotedRegion }) => !insidePromotedRegion)).toBe(true);
      expect(value.diagnostics.map(({ code }) => code)).toContain("JOBKOREA_PROMOTED_CLASS_SUBSTRING_OVERMATCH");
    } finally { await page.close(); }
  });

  it("exact·bounded class token, explicit data value와 nearest semantic label만 promotion evidence로 인정한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.explicitPromotionSignals);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 9, promotedDetailLinkCount: 9,
      rejectedDetailLinkCount: 0, promotedContainerCount: 9 });
    expect(value.promotedCandidates).toHaveLength(9);
    expect(value.promotionSignalCounts).toEqual({ data_attribute: 3, exact_class_token: 5, semantic_label: 1 });
    expect(value.diagnosticSamples.promoted.map(({ promotionSignal }) => promotionSignal)).toEqual([
      "exact_class_token", "exact_class_token", "exact_class_token", "exact_class_token",
      "data_attribute", "data_attribute", "data_attribute", "semantic_label", "exact_class_token",
    ]);
    expect(value.diagnosticSamples.promoted.every(({ insidePromotedRegion }) => insidePromotedRegion)).toBe(true);
  });

  it("standard·header·load·opaque analytics data values는 promotion evidence가 아니다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.nonPromotionDataValues);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 4, promotedDetailLinkCount: 0,
      rejectedDetailLinkCount: 4, promotedContainerCount: 0 });
    expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 4 });
  });

  it("promotion ancestor는 6단계에서 멈추고 MAIN의 page-level label을 전파하지 않는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.boundedPromotionScope);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 2, promotedDetailLinkCount: 0,
      rejectedDetailLinkCount: 2 });
    expect(value.diagnosticSamples.rejected.every(({ insidePromotedRegion }) => !insidePromotedRegion)).toBe(true);
  });

  it("mixed root에서 historic ordinary, explicit promotion, generic unknown을 상호 배타적으로 분류한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.mixedPromotionScope);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 3, ordinaryDetailLinkCount: 1,
      promotedDetailLinkCount: 1, rejectedDetailLinkCount: 1 });
    expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 1 });
    expect(value.ordinaryCandidates.map(({ postingId }) => postingId)).toEqual(["59000001"]);
    expect(value.promotedCandidates.map(({ postingId }) => postingId)).toEqual(["59000002"]);
  });

  it("known result root 밖 numeric link를 OUTSIDE_RESULT_ROOT로 집계한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.outsideResultRoot);
    expect(value.rejectionReasonCounts).toEqual({ OUTSIDE_RESULT_ROOT: 1 });
    expect(value.evidence.numericLinksOutsideKnownResultRoots).toBe(1);
    expect(value.shadowStructure).toMatchObject({ structurallyEligibleGroupCount: 0,
      structuralGroupRejectionReasonCounts: { OUTSIDE_KNOWN_RESULT_ROOT: 1 } });
  });

  it("88/28/60 measured-shape simulation의 complete aggregate와 bounded samples를 유지한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.measuredShape88);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 88, ordinaryDetailLinkCount: 0,
      promotedDetailLinkCount: 28, rejectedDetailLinkCount: 60, numericLinksInsideKnownCardResults: 88 });
    expect(value.rejectionReasonCounts).toEqual({ ANCESTOR_SIGNATURE_UNRECOGNIZED: 60 });
    expect(value.promotionSignalCounts).toEqual({ exact_class_token: 28 });
    expect(value.promotedCandidates).toHaveLength(10);
    expect(value.rejectedCandidates).toHaveLength(20);
    expect(value.diagnosticSamples).toMatchObject({ promotedTruncated: true, rejectedTruncated: true });
    expect(value.containerSignatures.length).toBeLessThanOrEqual(20);
    expect(value.containerSignatures.every(({ samplePostingIds }) => samplePostingIds.length <= 3)).toBe(true);
    expect(value.serializedSnapshotBytes).toBeLessThanOrEqual(256 * 1024);
    expect(value.diagnostics.map(({ code }) => code)).toContain("JOBKOREA_ORDINARY_CONTAINER_CONTRACT_MISMATCH");
    expect(value.diagnosticSamples.rejected.every(({ insidePromotedRegion }) => !insidePromotedRegion)).toBe(true);
  });

  it("element signature는 class/data/depth를 제한하고 arbitrary DOM text를 보존하지 않는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.signatureSanitization);
    const sample = value.diagnosticSamples.rejected[0]!;
    expect(sample.anchor.classes).toEqual([...sample.anchor.classes].sort());
    expect(sample.anchor.classes).toHaveLength(8);
    expect(sample.anchor.dataAttributes).toEqual({ "data-type": "posting" });
    expect(sample.ancestors[0]?.dataAttributes["data-track"]).toHaveLength(100);
    expect(JSON.stringify(sample)).not.toMatch(/data-secret|must-not-cross|민감하지 않은 가상 제목|innerHTML|outerHTML|textContent/);
  });

  it("ancestor와 container summary cap을 deterministic truncation diagnostic으로 남긴다", async () => {
    const deep = await snapshot(syntheticJobKoreaPages.deepAncestors);
    expect(deep.diagnosticSamples.rejected[0]?.ancestors).toHaveLength(8);
    const many = await snapshot(syntheticJobKoreaPages.manyContainerSignatures);
    expect(many.containerSignatures).toHaveLength(20);
    expect(many.containerSignaturesTruncated).toBe(true);
    expect(many.diagnostics.map(({ code }) => code)).toContain("JOBKOREA_CONTAINER_SIGNATURES_TRUNCATED");
  });

  it("readiness와 동일한 DOM은 unchanged이며 numeric/container 변화는 별도 진단한다", async () => {
    const page = await context.newPage();
    try {
      await page.setContent(syntheticJobKoreaPages.newCardBased);
      const readiness = await captureJobKoreaReadinessEvidence(page);
      const unchanged = await captureJobKoreaPageSnapshot(page, readiness);
      expect(unchanged).toMatchObject({ domChangedAfterReadiness: false,
        readiness: { reason: "numeric_detail_link", numericDetailLinkCount: 1 } });
      await page.evaluate(`document.querySelector('main').insertAdjacentHTML('beforeend','<article class="another-shape"><a href="/Recruit/GI_Read/50009999">synthetic</a></article>')`);
      const changed = await captureJobKoreaPageSnapshot(page, readiness);
      expect(changed.domChangedAfterReadiness).toBe(true);
      expect(changed.diagnostics.map(({ code }) => code)).toContain("JOBKOREA_READINESS_SNAPSHOT_DOM_CHANGED");
    } finally { await page.close(); }
  });

  it("handles an SVG ancestor class token without substring promotion or a browser-realm throw", async () => {
    const value = await snapshot(syntheticJobKoreaPages.svgGenericClass);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 1, promotedDetailLinkCount: 0,
      rejectedDetailLinkCount: 1 });
    expect(value.promotionSignalCounts).toEqual({});
  });

  it("keeps recommendation and recent-view exclusions separate from promotion", async () => {
    const value = await snapshot(syntheticJobKoreaPages.recommendationAndRecent);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 2, promotedDetailLinkCount: 0,
      rejectedDetailLinkCount: 2, recommendationContainerCount: 1, recentViewContainerCount: 1 });
    expect(value.rejectionReasonCounts).toEqual({ INSIDE_RECENT_VIEW_REGION: 1, INSIDE_RECOMMENDATION_REGION: 1 });
    expect(value.promotionSignalCounts).toEqual({});
  });

  it("same posting ID의 relative·absolute·tracking link를 lowest safe shared ancestor로 묶는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.structuralMeasuredShape88);
    const group = value.shadowStructure.provisionalPostingGroups[0]!;
    expect(group).toMatchObject({ postingId: "60000000", linkCount: 3, sourcePositions: [1, 2, 3],
      allLinksSharePostingId: true, insideKnownResultRoot: true, repeatedSiblingStructure: true,
      structurallyEligible: true, groupAncestor: { tag: "div", classes: ["flex", "gap-5", "p-7", "w-full"] } });
    expect(group.canonicalUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/60000000");
    expect(group.groupAncestorDepth).toBeGreaterThan(1);
  });

  it("synthetic 28x3 + 2x2 shape를 30개 provisional group으로 측정하되 production 분류는 유지한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.structuralMeasuredShape88);
    expect(value.evidence).toMatchObject({ allNumericDetailLinkCount: 88, ordinaryDetailLinkCount: 0,
      promotedDetailLinkCount: 0, rejectedDetailLinkCount: 88 });
    expect(value.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 30,
      structurallyEligibleGroupCount: 30, structurallyRejectedGroupCount: 0,
      totalGroupedNumericLinkCount: 88, ungroupedNumericLinkCount: 0,
      structurallyEligibleButUnverified: 30, verifiedOrdinaryAlsoStructurallyEligible: 0 });
    expect(value.shadowStructure.provisionalUniquePostingIds).toHaveLength(30);
    expect(value.shadowStructure.structuralGroupSignatureSummaries[0]).toMatchObject({
      groupCount: 30, eligibleGroupCount: 30, rejectedGroupCount: 0,
      linkCountDistribution: { "2": 2, "3": 28 }, siblingGroupCountMaximum: 30,
    });
    expect(value.shadowStructure.repeatedListParentSummaries[0]).toMatchObject({ parentCount: 1,
      repeatedGroupCount: 30, samplePostingIds: ["60000000", "60000001", "60000002"] });
    expect(classifyJobKoreaRenderedPage(value)).toBe("malformed_results");
    expect(value.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "JOBKOREA_ORDINARY_CONTAINER_CONTRACT_MISMATCH", "JOBKOREA_PROVISIONAL_ORDINARY_STRUCTURE_DETECTED",
    ]));
    expect(value.serializedSnapshotBytes).toBeLessThanOrEqual(256 * 1024);
  });

  it("single-link card는 세 반복 sibling일 때만 provisional eligibility를 얻는다", async () => {
    const repeated = await snapshot(syntheticJobKoreaPages.repeatedSingleLinkCards);
    expect(repeated.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 3,
      structurallyEligibleGroupCount: 3, structurallyRejectedGroupCount: 0 });
    const isolatedPair = await snapshot(syntheticJobKoreaPages.twoSingleLinkCards);
    expect(isolatedPair.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 2,
      structurallyEligibleGroupCount: 0, structurallyRejectedGroupCount: 2,
      structuralGroupRejectionReasonCounts: { GROUP_STRUCTURE_NOT_REPEATED: 2 } });
  });

  it("page-level·mixed-ID·split group을 provisional ordinary로 승인하지 않는다", async () => {
    const broad = await snapshot(syntheticJobKoreaPages.broadMixedIdWrapper);
    expect(broad.shadowStructure.structurallyEligibleGroupCount).toBe(0);
    expect(broad.shadowStructure.structuralGroupRejectionReasonCounts).toMatchObject({ MULTIPLE_POSTING_IDS_IN_GROUP: 5 });
    const mixed = await snapshot(syntheticJobKoreaPages.repeatedMixedIdSiblings);
    expect(mixed.shadowStructure.structurallyEligibleGroupCount).toBe(0);
    expect(mixed.shadowStructure.structuralGroupRejectionReasonCounts.MULTIPLE_POSTING_IDS_IN_GROUP).toBe(6);
    const split = await snapshot(syntheticJobKoreaPages.splitPostingGroup);
    expect(split.shadowStructure.structurallyEligibleGroupCount).toBe(0);
    expect(split.shadowStructure.structuralGroupRejectionReasonCounts.DUPLICATE_GROUP).toBe(1);
  });

  it("promoted·recommendation·recent group을 structural eligibility에서 제외한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.mixedStructuralExclusions);
    expect(value.shadowStructure.structurallyEligibleGroupCount).toBe(3);
    expect(value.shadowStructure.structuralGroupRejectionReasonCounts).toMatchObject({
      GROUP_CONTAINS_PROMOTED_EVIDENCE: 1,
      GROUP_CONTAINS_RECOMMENDATION_EVIDENCE: 1,
      GROUP_CONTAINS_RECENT_VIEW_EVIDENCE: 1,
      MULTIPLE_POSTING_IDS_IN_GROUP: 2,
    });
    expect(value.shadowStructure.provisionalPostingGroups.filter(({ structurallyEligible }) => structurallyEligible)
      .every(({ explicitPromotionEvidence, explicitRecommendationEvidence, explicitRecentViewEvidence }) =>
        !explicitPromotionEvidence && !explicitRecommendationEvidence && !explicitRecentViewEvidence)).toBe(true);
  });

  it("historic devloopArea production candidates는 provisional-only로 이중 계산하지 않는다", async () => {
    const html = syntheticJobKoreaPages.validSearch.replace("</table>",
      '<tr class="devloopArea" data-gno="50000003"><td><a href="/Recruit/GI_Read/50000003">third</a></td></tr></table>');
    const value = await snapshot(html);
    expect(value.ordinaryCandidates).toHaveLength(3);
    expect(value.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 0,
      structurallyEligibleButUnverified: 0, verifiedOrdinaryAlsoStructurallyEligible: 3,
      verifiedOrdinaryStructuralMismatch: 0 });
  });

  it("MAIN/result root를 posting ancestor로 허용하지 않는다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.pageLevelGroups);
    expect(value.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 2,
      structurallyEligibleGroupCount: 0, structurallyRejectedGroupCount: 2,
      structuralGroupRejectionReasonCounts: { GROUP_ANCESTOR_IS_PAGE_LEVEL: 2 } });
    expect(value.shadowStructure.provisionalPostingGroups.every(({ groupAncestor }) => groupAncestor?.tag === "main")).toBe(true);
  });

  it("group sample과 structural summary를 deterministic cap으로 제한하고 aggregate는 보존한다", async () => {
    const value = await snapshot(syntheticJobKoreaPages.manyStructuralGroups);
    expect(value.shadowStructure).toMatchObject({ provisionalPostingGroupCount: 45,
      structurallyEligibleGroupCount: 0, structurallyRejectedGroupCount: 45,
      provisionalGroupSamplesTruncated: true, structuralSummariesTruncated: true });
    expect(value.shadowStructure.provisionalPostingGroups).toHaveLength(40);
    expect(value.shadowStructure.structuralGroupSignatureSummaries).toHaveLength(20);
    expect(value.shadowStructure.structuralGroupRejectionReasonCounts.GROUP_STRUCTURE_NOT_REPEATED).toBe(45);
    expect(value.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "JOBKOREA_PROVISIONAL_GROUPS_TRUNCATED", "JOBKOREA_STRUCTURAL_SUMMARIES_TRUNCATED",
    ]));
  });
});
