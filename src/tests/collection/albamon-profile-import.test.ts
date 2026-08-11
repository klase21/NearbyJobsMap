import { describe, expect, it } from "vitest";
import {
  canonicalAlbamonProfile,
  decodeAlbamonExclusionKeywords,
  encodeAlbamonExclusionKeywords,
  parseAlbamonProfileUrl,
} from "../../services/albamon-profile-import";

const urlFor = (keywords: string, extras = "&page=500&utm_source=ignored") =>
  `https://www.albamon.com/jobs/total?searchPeriodType=ALL&sortType=MONTHLY_SALARY&areas=I000%2CB000&excludeKeywords=${keywords}&excludeBar=true${extras}`;

describe("Albamon personal profile URL import", () => {
  it("preserves a complete long UTF-8 exclusion list, exact order, and form-url round trip", () => {
    const entries = ["테스트제외어001", "ASCII-TEST", "12345", "U+", "테스트/슬래시", ...Array.from({ length: 239 }, (_, index) => `테스트제외어${String(index + 6).padStart(3, "0")}`)];
    const encoded = entries.map((item) => encodeURIComponent(item)).join("%2C");
    const parsed = parseAlbamonProfileUrl(urlFor(encoded));
    expect(parsed.rawKeywordCount).toBe(244);
    expect(parsed.keywords).toEqual(["테스트제외어001", "ascii-test", "12345", "u+", "테스트/슬래시", ...entries.slice(5)]);
    expect(parsed.roundTripMatch).toBe(true);
    expect(decodeAlbamonExclusionKeywords(encodeAlbamonExclusionKeywords(parsed.keywords))).toEqual(parsed.keywords);
    expect(parsed).toMatchObject({ searchPeriodType: "ALL", sortType: "MONTHLY_SALARY", areas: "I000,B000", excludeBar: true, ignoredPage: "500" });
  });

  it("removes empty and exact normalized duplicates while preserving first occurrence", () => {
    const parsed = parseAlbamonProfileUrl(urlFor("%ED%85%8C%EC%8A%A4%ED%8A%B8%2C%2CASCII%2Cascii%2CU%2B"));
    expect(parsed.keywords).toEqual(["테스트", "ascii", "u+"]);
    expect(parsed.emptyEntriesRemoved).toBe(1);
    expect(parsed.duplicateEntriesRemoved).toBe(1);
  });

  it("supports the 500-entry imported-profile ceiling with synthetic values", () => {
    const entries = Array.from({ length: 500 }, (_, index) => `합성제외어${String(index + 1).padStart(3, "0")}`);
    const parsed = parseAlbamonProfileUrl(urlFor(entries.map(encodeURIComponent).join("%2C")));
    expect(parsed.keywords).toEqual(entries);
    expect(parsed.roundTripMatch).toBe(true);
  });

  it("rejects non-public hosts and unrelated paths", () => {
    expect(() => parseAlbamonProfileUrl(urlFor("%ED%85%8C%EC%8A%A4%ED%8A%B8").replace("www.albamon.com", "example.com"))).toThrow();
    expect(() => parseAlbamonProfileUrl(urlFor("%ED%85%8C%EC%8A%A4%ED%8A%B8").replace("/jobs/total", "/jobs/detail/1"))).toThrow();
    expect(() => parseAlbamonProfileUrl("javascript:alert(1)")).toThrow();
  });

  it("does not include source page or tracking parameters in the canonical profile", () => {
    const first = parseAlbamonProfileUrl(urlFor("%ED%85%8C%EC%8A%A4%ED%8A%B8", "&page=1&utm_source=a"));
    const second = parseAlbamonProfileUrl(urlFor("%ED%85%8C%EC%8A%A4%ED%8A%B8", "&page=500&utm_source=b"));
    expect(canonicalAlbamonProfile(first)).toBe(canonicalAlbamonProfile(second));
    const emptyCanonical = JSON.stringify({ source: "albamon", searchPeriodType: "ALL", sortType: "MONTHLY_SALARY", areas: "I000,B000", excludeKeywords: [], excludeBar: true, pageSize: 50, maxPages: 150 });
    expect(canonicalAlbamonProfile(first)).not.toBe(emptyCanonical);
  });
});
