import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import {
  JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE,
  captureJobKoreaPageSnapshot,
  JOBKOREA_SNAPSHOT_MAX_BYTES,
  JobKoreaSnapshotError,
  validateAndRoundTripJobKoreaSnapshot,
  validateJobKoreaPageSnapshot,
} from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import type { JobKoreaPageSnapshot } from "../../sources/jobkorea/transport/jobkorea-search-types";

const validSnapshot = (): JobKoreaPageSnapshot => ({
  schemaVersion: 1, finalUrl: "https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", pageTitle: "가상 검색",
  readyState: "complete", extractionCompleted: true,
  evidence: { ordinaryContainerCount: 1, ordinaryDetailLinkCount: 1, allNumericDetailLinkCount: 1,
    promotedContainerCount: 0, promotedDetailLinkCount: 0, rejectedDetailLinkCount: 0, noResultMarkerCount: 0,
    loginMarkerCount: 0, captchaMarkerCount: 0, verificationMarkerCount: 0, accessDeniedMarkerCount: 0 },
  ordinaryCandidates: [{ postingId: "50000001", href: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001",
    title: "가상 공고", companyName: "가상회사", position: 1, rowId: "50000001", sourceSelector: "tr.devloopArea[data-gno]" }],
  promotedCandidates: [], rejectedCandidates: [], diagnostics: [],
});

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
    expect(JSON.stringify(result)).not.toContain("undefined");
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

  it.each([
    { ...validSnapshot(), schemaVersion: 2 },
    { ...validSnapshot(), evidence: { ...validSnapshot().evidence, ordinaryDetailLinkCount: -1 } },
    { ...validSnapshot(), ordinaryCandidates: [{ ...validSnapshot().ordinaryCandidates[0]!, postingId: "bad" }] },
  ])("malformed snapshot shape를 runtime validation에서 거부한다", (value) => {
    expect(() => validateJobKoreaPageSnapshot(value)).toThrowError(JobKoreaSnapshotError);
  });

  it("완료되지 않은 snapshot의 unknown counts는 null이어야 한다", () => {
    const incomplete = { ...validSnapshot(), extractionCompleted: false,
      evidence: Object.fromEntries(Object.keys(validSnapshot().evidence).map((key) => [key, null])), ordinaryCandidates: [] };
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
    await expect(captureJobKoreaPageSnapshot(page)).rejects.toMatchObject({ code: "JOBKOREA_SNAPSHOT_RESULT_MALFORMED" });
  });
});
