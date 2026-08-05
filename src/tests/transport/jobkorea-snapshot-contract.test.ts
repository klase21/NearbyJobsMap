import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import {
  JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE,
  captureJobKoreaPageSnapshot,
  JOBKOREA_SNAPSHOT_MAX_BYTES,
  emptyJobKoreaShadowStructure,
  JobKoreaSnapshotError,
  validateAndRoundTripJobKoreaSnapshot,
  validateJobKoreaPageSnapshot,
} from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import type { JobKoreaPageSnapshot } from "../../sources/jobkorea/transport/jobkorea-search-types";

const rawSnapshot = (): JobKoreaPageSnapshot => ({
  schemaVersion: 2, serializedSnapshotBytes: 0,
  finalUrl: "https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", pageTitle: "가상 검색",
  documentReadyState: "complete", extractionCompleted: true, extractionDurationMs: 1,
  readiness: { reason: "numeric_detail_link", numericDetailLinkCount: 1, ordinaryContainerCount: 1 },
  domChangedAfterReadiness: false,
  evidence: { ordinaryContainerCount: 1, ordinaryRowCount: 1, resultRootCount: 1, knownTableResultCount: 1,
    knownListResultCount: 0, knownCardResultCount: 0, numericLinksInsideKnownTableResults: 1,
    numericLinksInsideKnownListResults: 0, numericLinksInsideKnownCardResults: 0, ordinaryDetailLinkCount: 1, allNumericDetailLinkCount: 1,
    promotedContainerCount: 0, recommendationContainerCount: 0, recentViewContainerCount: 0,
    promotedDetailLinkCount: 0, rejectedDetailLinkCount: 0, numericLinksInsideKnownResultRoots: 1,
    numericLinksOutsideKnownResultRoots: 0, noResultMarkerCount: 0,
    loginMarkerCount: 0, captchaMarkerCount: 0, verificationMarkerCount: 0, accessDeniedMarkerCount: 0 },
  rejectionReasonCounts: {}, promotionSignalCounts: {},
  ordinaryCandidates: [{ postingId: "50000001", href: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001",
    title: "가상 공고", companyName: "가상회사", position: 1, rowId: "50000001", sourceSelector: "tr.devloopArea[data-gno]" }],
  promotedCandidates: [], rejectedCandidates: [],
  diagnosticSamples: { ordinary: [], promoted: [], rejected: [], ordinaryTruncated: false, promotedTruncated: false, rejectedTruncated: false },
  containerSignatures: [], containerSignaturesTruncated: false, shadowStructure: emptyJobKoreaShadowStructure(1), diagnostics: [],
});
const validSnapshot = (): JobKoreaPageSnapshot => validateAndRoundTripJobKoreaSnapshot(rawSnapshot());

describe("잡코리아 snapshot JSON-safe contract", () => {
  it("page realm evaluator는 tsx helper나 TypeScript 문법이 없는 self-contained JavaScript다", () => {
    expect(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE).toMatch(/^\(\(\) => \{/);
    expect(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE).not.toContain("__name");
    expect(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE).not.toMatch(/:\s*(unknown|number|string|Array<)/);
    expect(() => new Function(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE)).not.toThrow();
  });

  it("valid snapshot은 JSON round-trip 후 동일한 plain object다", () => {
    const result = validateAndRoundTripJobKoreaSnapshot(validSnapshot());
    expect(result).toEqual(validSnapshot());
    expect(result.serializedSnapshotBytes).toBe(Buffer.byteLength(JSON.stringify(result), "utf8"));
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("rejects a promotion-signal aggregate that does not equal the promoted count", () => {
    const mismatch = { ...rawSnapshot(), evidence: { ...rawSnapshot().evidence, promotedDetailLinkCount: 1 },
      promotionSignalCounts: {} };
    expect(() => validateAndRoundTripJobKoreaSnapshot(mismatch)).toThrowError(
      expect.objectContaining({ code: "JOBKOREA_PROMOTED_SIGNAL_COUNT_MISMATCH" }),
    );
  });

  it.each([
    ["undefined", { ...validSnapshot(), extra: undefined }],
    ["Error", { ...validSnapshot(), extra: new Error("no") }],
    ["URL", { ...validSnapshot(), extra: new URL("https://example.test") }],
    ["Map", { ...validSnapshot(), extra: new Map([["x", 1]]) }],
    ["Set", { ...validSnapshot(), extra: new Set([1]) }],
    ["BigInt", { ...validSnapshot(), extra: BigInt(1) }],
  ])("%s 같은 비지원 값을 거부한다", (_label, value) => {
    expect(() => validateAndRoundTripJobKoreaSnapshot(value)).toThrowError(JobKoreaSnapshotError);
    try { validateAndRoundTripJobKoreaSnapshot(value); } catch (error) {
      expect((error as JobKoreaSnapshotError).code).toBe("JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE");
    }
  });

  it("cyclic object를 serialization failure로 거부한다", () => {
    const value = validSnapshot() as JobKoreaPageSnapshot & { cycle?: unknown };
    value.cycle = value;
    expect(() => validateAndRoundTripJobKoreaSnapshot(value)).toThrowError(expect.objectContaining({ code: "JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED" }));
  });

  it("serialized size cap을 넘으면 payload를 반환하지 않는다", () => {
    expect(JOBKOREA_SNAPSHOT_MAX_BYTES).toBe(256 * 1024);
    expect(() => validateAndRoundTripJobKoreaSnapshot(validSnapshot(), 100)).toThrowError(expect.objectContaining({ code: "JOBKOREA_SNAPSHOT_TOO_LARGE" }));
  });

  it("rejection reason aggregate 합계와 deterministic key order를 검증한다", () => {
    const mismatch = { ...rawSnapshot(), evidence: { ...rawSnapshot().evidence, rejectedDetailLinkCount: 1 } };
    expect(() => validateAndRoundTripJobKoreaSnapshot(mismatch)).toThrowError(expect.objectContaining({ code: "JOBKOREA_REJECTION_COUNT_MISMATCH" }));
    const unordered = { ...rawSnapshot(), evidence: { ...rawSnapshot().evidence, rejectedDetailLinkCount: 2 },
      rejectionReasonCounts: { OUTSIDE_RESULT_ROOT: 1, ANCESTOR_SIGNATURE_UNRECOGNIZED: 1 },
      rejectedCandidates: [
        { postingId: "1", href: "https://www.jobkorea.co.kr/Recruit/GI_Read/1", reason: "OUTSIDE_RESULT_ROOT" },
        { postingId: "2", href: "https://www.jobkorea.co.kr/Recruit/GI_Read/2", reason: "ANCESTOR_SIGNATURE_UNRECOGNIZED" },
      ] };
    expect(() => validateAndRoundTripJobKoreaSnapshot(unordered)).toThrowError(expect.objectContaining({ code: "JOBKOREA_SNAPSHOT_V2_VALIDATION_FAILED" }));
  });

  it("UNKNOWN_REJECTION fallback을 machine-readable reason으로 허용한다", () => {
    const value = validateAndRoundTripJobKoreaSnapshot({ ...rawSnapshot(), evidence: { ...rawSnapshot().evidence, rejectedDetailLinkCount: 1 },
      rejectionReasonCounts: { UNKNOWN_REJECTION: 1 },
      rejectedCandidates: [{ postingId: "9", href: "https://www.jobkorea.co.kr/Recruit/GI_Read/9", reason: "UNKNOWN_REJECTION" }] });
    expect(value.rejectionReasonCounts).toEqual({ UNKNOWN_REJECTION: 1 });
  });

  it("shadow group 및 link aggregate count 불일치를 precise diagnostic으로 거부한다", () => {
    const groupMismatch = { ...rawSnapshot(), shadowStructure: { ...emptyJobKoreaShadowStructure(1),
      provisionalPostingGroupCount: 2, structurallyEligibleGroupCount: 1 } };
    expect(() => validateAndRoundTripJobKoreaSnapshot(groupMismatch)).toThrowError(
      expect.objectContaining({ code: "JOBKOREA_PROVISIONAL_GROUP_COUNT_MISMATCH" }),
    );
    const linkMismatch = { ...rawSnapshot(), shadowStructure: emptyJobKoreaShadowStructure(0) };
    expect(() => validateAndRoundTripJobKoreaSnapshot(linkMismatch)).toThrowError(
      expect.objectContaining({ code: "JOBKOREA_PROVISIONAL_LINK_COUNT_MISMATCH" }),
    );
  });

  it("page-level provisional ancestor와 malformed multi-ID group shape를 거부한다", () => {
    const base = emptyJobKoreaShadowStructure(0);
    const malformed = { ...rawSnapshot(), shadowStructure: { ...base, provisionalPostingGroupCount: 1,
      structurallyRejectedGroupCount: 1, totalGroupedNumericLinkCount: 1,
      structuralGroupRejectionReasonCounts: { GROUP_ANCESTOR_IS_PAGE_LEVEL: 1 }, provisionalUniquePostingIds: ["50000001"],
      provisionalPostingGroups: [{ postingId: "50000001", canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001",
        linkCount: 1, sourcePositions: [1], groupAncestor: null, groupAncestorDepth: null, parentListSignature: null,
        siblingGroupCount: null, uniquePostingIdsInsideGroup: ["50000001", "50000002"], allLinksSharePostingId: true,
        insideKnownResultRoot: true, explicitPromotionEvidence: false, explicitRecommendationEvidence: false,
        explicitRecentViewEvidence: false, repeatedSiblingStructure: false, structurallyEligible: false, verifiedOrdinary: false,
        rejectionReasons: ["GROUP_ANCESTOR_IS_PAGE_LEVEL"], structuralSignatureKey: null, parentSignatureKey: null }] } };
    expect(() => validateAndRoundTripJobKoreaSnapshot(malformed)).toThrowError(JobKoreaSnapshotError);
  });

  it.each([
    { ...validSnapshot(), schemaVersion: 1 },
    { ...validSnapshot(), evidence: { ...validSnapshot().evidence, ordinaryDetailLinkCount: -1 } },
    { ...validSnapshot(), ordinaryCandidates: [{ ...validSnapshot().ordinaryCandidates[0]!, postingId: "bad" }] },
  ])("malformed snapshot shape를 runtime validation에서 거부한다", (value) => {
    expect(() => validateJobKoreaPageSnapshot(value)).toThrowError(JobKoreaSnapshotError);
  });

  it("완료되지 않은 snapshot의 unknown counts는 null이어야 한다", () => {
    const incomplete = validateAndRoundTripJobKoreaSnapshot({ ...rawSnapshot(), extractionCompleted: false,
      extractionDurationMs: null, evidence: Object.fromEntries(Object.keys(rawSnapshot().evidence).map((key) => [key, null])),
      ordinaryCandidates: [], readiness: null, domChangedAfterReadiness: null });
    expect(validateJobKoreaPageSnapshot(incomplete)).toMatchObject({ extractionCompleted: false,
      evidence: { ordinaryDetailLinkCount: null, promotedDetailLinkCount: null } });
  });

  it.each([
    ["JOBKOREA_SNAPSHOT_EVALUATION_FAILED", "synthetic evaluation failure"],
    ["JOBKOREA_SNAPSHOT_EXECUTION_CONTEXT_DESTROYED", "Execution context was destroyed during navigation"],
    ["JOBKOREA_SNAPSHOT_TRANSFORM_HELPER_MISSING", "ReferenceError: __name is not defined"],
  ])("page.evaluate rejection을 %s로 분류한다", async (code, message) => {
    const page = { evaluate: async () => { throw new Error(message); } } as unknown as Page;
    await expect(captureJobKoreaPageSnapshot(page)).rejects.toMatchObject({ code });
  });

  it("page.evaluate가 반환한 non-serializable 값은 precise diagnostic으로 거부한다", async () => {
    const page = { evaluate: async () => ({ ...validSnapshot(), unsupported: new Map() }) } as unknown as Page;
    await expect(captureJobKoreaPageSnapshot(page)).rejects.toMatchObject({ code: "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE" });
  });

  it("page.evaluate가 반환한 malformed shape는 validation diagnostic으로 거부한다", async () => {
    const page = { evaluate: async () => ({ ...validSnapshot(), schemaVersion: 999 }) } as unknown as Page;
    await expect(captureJobKoreaPageSnapshot(page)).rejects.toMatchObject({ code: "JOBKOREA_SNAPSHOT_SCHEMA_VERSION_UNSUPPORTED" });
  });
});
