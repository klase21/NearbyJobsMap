import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAlbamonListingUrl } from "../../sources/albamon/collection/albamon-url-policy";
import { jobKoreaSearchPageUrl } from "../../sources/jobkorea/transport/jobkorea-url-policy";
import { buildJobKoreaTodayForm, JOBKOREA_TODAY_ENDPOINT } from "../../sources/jobkorea/today/jobkorea-http-today";

describe("local today collection safety contract", () => {
  it("allows only the bounded local page ceilings", () => {
    expect(jobKoreaSearchPageUrl("https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", 50, 50)).toContain("Page_No=50");
    expect(() => jobKoreaSearchPageUrl("https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", 51, 50)).toThrow();
    const capital = new URL(buildAlbamonListingUrl(100, "I000,B000", 100));
    expect(capital.searchParams.get("searchPeriodType")).toBe("TODAY");
    expect(capital.searchParams.get("areas")).toBe("I000,B000");
    expect(() => buildAlbamonListingUrl(101, "I000,B000", 100)).toThrow();
    expect(buildJobKoreaTodayForm(100).get("page")).toBe("100");
  });
  it("keeps details, BFF, retries, and arbitrary URLs out of the CLI", () => {
    const source = readFileSync("scripts/collect-today.ts", "utf8");
    expect(source).toContain("detail requests=0");
    expect(source).toContain("BFF requests=0");
    expect(source).toContain("retries=0");
    expect(source).not.toContain("--url");
    expect(source).not.toContain("fetchDetail(");
    expect(source).toContain('presetId: "albamon-capital-today"');
    expect(source).toContain("requestedRegions: config.regions");
    expect(source).toContain("JOBKOREA_TODAY_ENDPOINT");
    expect(JOBKOREA_TODAY_ENDPOINT).toBe("https://www.jobkorea.co.kr/Recruit/Home/_GI_List/");
    expect(source).not.toContain("buildJobKoreaKeywordSearchUrl");
    expect(source).not.toContain("buildJobKoreaTodayListUrl");
    expect(source).toContain("--exclude-keyword");
  });
});
