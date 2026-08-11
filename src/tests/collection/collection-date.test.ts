import { describe, expect, it } from "vitest";
import { classifyPostingDateEvidence, classifyPostingDateEvidenceAt, createSourcePostingDateEvidence, koreaCalendarDate, resolveTodayScope } from "../../services/collection-date";

describe("Korea today collection date", () => {
  it("resolves the Korea date once across UTC boundaries", () => {
    expect(koreaCalendarDate(new Date("2026-08-06T15:00:00.000Z"))).toBe("2026-08-07");
    expect(resolveTodayScope(new Date("2026-08-07T14:59:59.000Z"))).toEqual({ type: "today", timezone: "Asia/Seoul", resolvedDate: "2026-08-07" });
  });
  it.each(["오늘", "방금", "3분 전", "12시간 전", "2026-08-07", "2026.08.07", "08.07"])("classifies %s as today", (value) => {
    expect(classifyPostingDateEvidence(value, "2026-08-07").status).toBe("today");
  });
  it.each(["어제", "1일 전", "2026-08-06", "08.06"])("classifies %s as older", (value) => {
    expect(classifyPostingDateEvidence(value, "2026-08-07").status).toBe("older");
  });
  it("keeps unknown evidence unknown and rejects future evidence", () => {
    expect(classifyPostingDateEvidence(null, "2026-08-07").status).toBe("unknown");
    expect(classifyPostingDateEvidence("등록일 미상", "2026-08-07").status).toBe("unknown");
    expect(classifyPostingDateEvidence("2026-08-08", "2026-08-07").status).toBe("future_invalid");
    expect(classifyPostingDateEvidence("2026-02-30", "2026-08-07").status).toBe("unknown");
  });
  it("infers an omitted year conservatively across New Year", () => {
    expect(classifyPostingDateEvidence("12.31", "2026-01-02")).toMatchObject({ status: "older", resolvedDate: "2025-12-31" });
    expect(classifyPostingDateEvidence("01.03", "2026-01-02")).toMatchObject({ status: "future_invalid", resolvedDate: "2026-01-03" });
  });
  it("keeps bounded raw source evidence and its dedicated source field", () => {
    expect(createSourcePostingDateEvidence("  15분   전 ", "listing_registered")).toEqual({ raw: "15분 전", kind: "relative_age", sourceField: "listing_registered" });
    expect(createSourcePostingDateEvidence("마감 오늘", "listing_posted_at")).toEqual({ raw: null, kind: "unknown", sourceField: "listing_posted_at" });
  });
  it("reconstructs minute ages against the actual Korea midnight boundary", () => {
    const observedAt = "2026-08-07T00:52:00.000Z"; // 09:52 KST
    for (const raw of ["1분 전", "30분전", "500분 전", "30분 전 등록"]) {
      expect(classifyPostingDateEvidenceAt(raw, observedAt, "2026-08-07").status).toBe("today");
    }
    expect(classifyPostingDateEvidenceAt("600분 전", observedAt, "2026-08-07")).toMatchObject({ status: "older" });
  });
  it("keeps hour labels unknown when their possible interval crosses midnight", () => {
    const observedAt = "2026-08-07T00:52:00.000Z";
    expect(classifyPostingDateEvidenceAt("1시간 전", observedAt, "2026-08-07")).toMatchObject({ status: "today", estimatedPostedAt: null });
    expect(classifyPostingDateEvidenceAt("8시간 전", observedAt, "2026-08-07")).toMatchObject({ status: "today" });
    expect(classifyPostingDateEvidenceAt("9시간 전", observedAt, "2026-08-07")).toMatchObject({ status: "unknown", midnightAmbiguous: true });
    expect(classifyPostingDateEvidenceAt("10시간 전", observedAt, "2026-08-07")).toMatchObject({ status: "older" });
  });
  it("keeps absolute dates conservative when classified at an observation", () => {
    expect(classifyPostingDateEvidenceAt("12.31", "2026-01-02T00:00:00.000Z", "2026-01-02"))
      .toMatchObject({ status: "older", resolvedDate: "2025-12-31", evidenceKind: "absolute_date" });
    expect(classifyPostingDateEvidenceAt("2026.08.08", "2026-08-07T00:00:00.000Z", "2026-08-07").status).toBe("future_invalid");
  });
});
