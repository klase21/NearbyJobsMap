import { describe, expect, it } from "vitest";
import { assessDuplicate } from "../../services/duplicate-detector";
import { canonicalJob } from "../factories";

describe("중복 판별", () => {
  it("동일 source posting ID는 exact다", () => {
    expect(assessDuplicate(canonicalJob(), canonicalJob({ sourceUrl: "https://different.test/" })).classification).toBe("exact");
  });

  it("같은 소스의 정규화 URL을 fallback identity로 사용한다", () => {
    const a = canonicalJob({ sourcePostingId: "", sourceUrl: "https://example.test/job/1?tracking=x", canonicalUrl: null });
    const b = canonicalJob({ sourcePostingId: "different", sourceUrl: "https://example.test/job/1#top", canonicalUrl: null });
    expect(assessDuplicate(a, b).classification).toBe("exact");
  });

  it("교차 소스의 강한 일치는 probable이며 자동 병합하지 않는다", () => {
    const b = canonicalJob({ source: "albamon", sourcePostingId: "99", id: "albamon:99", sourceUrl: "https://www.albamon.com/jobs/detail/99", canonicalUrl: "https://www.albamon.com/jobs/detail/99" });
    const result = assessDuplicate(canonicalJob(), b);
    expect(result.classification).toBe("probable");
    expect(result.score).toBeGreaterThanOrEqual(0.72);
    expect(result.reasons).toContain("회사명 일치");
  });

  it("일부 신호만 같으면 related다", () => {
    const b = canonicalJob({ source: "albamon", sourcePostingId: "99", id: "albamon:99", title: "홀 서빙", roadAddress: "서울 강남구 다른로 2", salary: parseDifferentSalary() });
    expect(assessDuplicate(canonicalJob(), b).classification).toBe("related");
  });

  it("비교 신호가 없으면 unknown이다", () => {
    const a = canonicalJob({ sourcePostingId: "", canonicalUrl: null, sourceUrl: "", title: "", companyName: "", normalizedCompanyName: null, roadAddress: null, district: null, neighborhood: null, salary: { ...canonicalJob().salary, minimumAmount: null, maximumAmount: null }, workStartTime: null, workEndTime: null, employmentTypes: [] });
    const b = { ...a, source: "albamon" as const };
    expect(assessDuplicate(a, b).classification).toBe("unknown");
  });
});

function parseDifferentSalary() {
  return { ...canonicalJob().salary, type: "hourly" as const, minimumAmount: 12_000, maximumAmount: 12_000 };
}
