import { describe, expect, it } from "vitest";
import { getSafeSourceUrl } from "../../services/external-url";

describe("안전한 외부 원문 URL", () => {
  it("예상 HTTPS 호스트 허용", () => expect(getSafeSourceUrl("jobkorea", "https://www.jobkorea.co.kr/Recruit/GI_Read/1")).toContain("jobkorea.co.kr"));
  it("HTTP 거부", () => expect(getSafeSourceUrl("albamon", "http://www.albamon.com/jobs/detail/1")).toBeNull());
  it("유사 악성 호스트 거부", () => expect(getSafeSourceUrl("albamon", "https://www.albamon.com.evil.test/jobs/detail/1")).toBeNull());
  it("깨진 URL 거부", () => expect(getSafeSourceUrl("jobkorea", "not-a-url")).toBeNull());
});
