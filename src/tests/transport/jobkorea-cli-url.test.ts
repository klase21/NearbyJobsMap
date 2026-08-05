import { describe, expect, it } from "vitest";
import { parseJobKoreaCliArgs } from "../../sources/jobkorea/transport/jobkorea-cli-args";
import { normalizeJobKoreaUrl, validateJobKoreaRedirect } from "../../sources/jobkorea/transport/jobkorea-url-policy";

const url = "https://www.jobkorea.co.kr/Search/?stext=서울";

describe("잡코리아 원샷 CLI", () => {
  it("명시적 확인을 요구한다", () => expect(() => parseJobKoreaCliArgs(["--listing-url", url])).toThrow(/--confirm/));
  it.each([1, 2, 3])("max-details %i를 허용한다", (maximum) => expect(parseJobKoreaCliArgs(["--listing-url", url, "--max-details", String(maximum), "--confirm"]).maxDetails).toBe(maximum));
  it.each(["0", "-1", "4", "1.5", "x"])("잘못된 max-details %s를 거부한다", (maximum) => expect(() => parseJobKoreaCliArgs(["--listing-url", url, "--max-details", maximum, "--confirm"])).toThrow(/1, 2, 3/));
  it("dry-run을 해석한다", () => expect(parseJobKoreaCliArgs(["--listing-url", url, "--dry-run", "--confirm"]).dryRun).toBe(true));
  it("listing URL을 요구한다", () => expect(() => parseJobKoreaCliArgs(["--confirm"])).toThrow(/listing-url/));
});

describe("잡코리아 URL·redirect 정책", () => {
  it("허용된 HTTPS listing과 detail을 정규화한다", () => {
    expect(normalizeJobKoreaUrl(`${url}&utm_source=x`, "listing")).toContain("stext=");
    expect(normalizeJobKoreaUrl("https://m.jobkorea.co.kr/Recruit/GI_Read/1?logpath=x", "detail")).toBe("https://m.jobkorea.co.kr/Recruit/GI_Read/1");
  });
  it.each(["http://www.jobkorea.co.kr/Search/", "https://evil.test/Search/", "https://user:pass@www.jobkorea.co.kr/Search/", "file:///Search/"])("위험 URL %s를 거부한다", (candidate) => expect(() => normalizeJobKoreaUrl(candidate, "listing")).toThrow());
  it("교차 도메인과 HTTPS downgrade redirect를 거부한다", () => {
    expect(() => validateJobKoreaRedirect(url, "https://evil.test/Search/", "listing")).toThrow(/리다이렉트/);
    expect(() => validateJobKoreaRedirect(url, "http://www.jobkorea.co.kr/Search/", "listing")).toThrow(/리다이렉트/);
  });
});
