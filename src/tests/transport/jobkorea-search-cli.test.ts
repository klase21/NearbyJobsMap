import { describe, expect, it } from "vitest";
import { parseJobKoreaSearchCliArgs } from "../../sources/jobkorea/transport/jobkorea-search-cli";
import { jobKoreaSearchPageUrl, normalizeJobKoreaSearchUrl, normalizeJobKoreaTodayListUrl, parseJobKoreaSearchPageNumber } from "../../sources/jobkorea/transport/jobkorea-url-policy";

const search = "https://www.jobkorea.co.kr/Search?stext=AI&tabType=recruit&Page_No=1";
const args = (...extra: string[]) => ["--search-url", search, "--pages", "1", "--max-details", "0", ...extra, "--confirm"];

describe("잡코리아 bounded search CLI", () => {
  it("confirmation과 search URL을 요구한다", () => {
    expect(() => parseJobKoreaSearchCliArgs(args().filter((value) => value !== "--confirm"))).toThrow(/--confirm/);
    expect(() => parseJobKoreaSearchCliArgs(["--pages", "1", "--max-details", "0", "--confirm"])).toThrow(/search-url/);
  });
  it.each([1, 2])("pages %i만 허용한다", (pages) => expect(parseJobKoreaSearchCliArgs(["--search-url", search, "--pages", String(pages), "--max-details", "0", "--confirm"]).pages).toBe(pages));
  it.each(["0", "3", "-1", "1.5"])("잘못된 pages %s를 거부한다", (pages) => expect(() => parseJobKoreaSearchCliArgs(["--search-url", search, "--pages", pages, "--max-details", "0", "--confirm"])).toThrow());
  it.each([0, 1, 2, 3])("max-details %i를 허용한다", (maximum) => expect(parseJobKoreaSearchCliArgs(["--search-url", search, "--pages", "1", "--max-details", String(maximum), "--confirm"]).maxDetails).toBe(maximum));
  it.each([-1, 4, 1.5])("잘못된 max-details %s를 거부한다", (maximum) => expect(() => parseJobKoreaSearchCliArgs(["--search-url", search, "--pages", "1", "--max-details", String(maximum), "--confirm"])).toThrow());
  it.each(["auto", "playwright", "direct"] as const)("transport %s를 해석한다", (transport) => expect(parseJobKoreaSearchCliArgs(args("--transport", transport)).transport).toBe(transport));
  it("dry-run과 명시된 page 수만 유지한다", () => expect(parseJobKoreaSearchCliArgs(args("--dry-run"))).toMatchObject({ dryRun: true, pages: 1 }));
  it("diagnostic 출력 요청을 명시적으로 해석한다", () => expect(parseJobKoreaSearchCliArgs(args("--diagnostic"))).toMatchObject({ diagnostic: true }));
  it("direct는 요청 상한 때문에 pages 2를 거부한다", () => expect(() => parseJobKoreaSearchCliArgs(["--search-url", search, "--pages", "2", "--max-details", "0", "--transport", "direct", "--confirm"])).toThrow(/pages 1/));
});

describe("잡코리아 search URL 정책", () => {
  it("Search URL과 Page_No를 정규화한다", () => {
    expect(parseJobKoreaSearchPageNumber(normalizeJobKoreaSearchUrl(search))).toBe(1);
    expect(jobKoreaSearchPageUrl(search, 2)).toContain("Page_No=2");
    expect(jobKoreaSearchPageUrl(search, 10)).toContain("Page_No=10");
    expect(normalizeJobKoreaSearchUrl("https://www.jobkorea.co.kr/Search?stext=AI")).toContain("tabType=recruit");
  });
  it.each(["http://www.jobkorea.co.kr/Search?stext=AI", "https://evil.test/Search?stext=AI", "https://user:pass@www.jobkorea.co.kr/Search?stext=AI", "https://www.jobkorea.co.kr/Search?Page_No=3"])("위험하거나 범위를 벗어난 URL을 거부한다", (url) => expect(() => normalizeJobKoreaSearchUrl(url)).toThrow());
  it("오늘 수집 전용 공개 joblist만 별도로 허용한다", () => {
    expect(normalizeJobKoreaTodayListUrl("https://www.jobkorea.co.kr/recruit/joblist")).toContain("Page_No=1");
    expect(jobKoreaSearchPageUrl("https://www.jobkorea.co.kr/recruit/joblist", 2, 50)).toContain("Page_No=2");
    expect(() => normalizeJobKoreaTodayListUrl(search)).toThrow("/recruit/joblist");
  });
});
