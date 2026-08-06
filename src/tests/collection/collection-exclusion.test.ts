import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyCandidateExclusions, canonicalizeExclusionConfig, matchCandidateExclusion, normalizeCollectionExclusionConfig, normalizeExclusionText, splitExclusionKeywordInput } from "../../services/collection-exclusion";
import { parseJobKoreaCollectionArgs } from "../../sources/jobkorea/collection/jobkorea-collection-cli";
import { parseAlbamonCollectionArgs } from "../../sources/albamon/collection/albamon-collection-cli";
import { selectAlbamonCandidates } from "../../sources/albamon/collection/albamon-collection-service";
import type { AlbamonListingPageResult } from "../../sources/albamon/collection/albamon-collection-types";
import { exclusionConfigurationHash } from "../../server/collection-control/collection-run-manager";
import { parseCollectionStartBody } from "../../server/collection-control/request-validation";

describe("collection exclusion normalization", () => {
  it("normalizes NFKC, whitespace and English case while preserving Korean", () => {
    expect(normalizeExclusionText("  ＡI   강사 ")).toBe("ai 강사");
    expect(normalizeExclusionText("공인  중개사")).toBe("공인 중개사");
  });

  it("removes empty and duplicate keywords in original order and defaults fields", () => {
    expect(normalizeCollectionExclusionConfig({ keywords: [" 강사 ", "", "강사", "WAITER"], fields: [] })).toEqual({ keywords: ["강사", "waiter"], fields: ["title", "category"] });
  });

  it("treats regex and wildcard characters as literal text", () => {
    const config = normalizeCollectionExclusionConfig({ keywords: ["a.*"], fields: ["title"] });
    expect(matchCandidateExclusion({ postingId: "1", listingPage: 1, sourcePosition: 1, title: "a.* operator" }, config)?.matchedKeyword).toBe("a.*");
    expect(matchCandidateExclusion({ postingId: "2", listingPage: 1, sourcePosition: 2, title: "aaaa" }, config)).toBeNull();
  });

  it("enforces keyword lengths, count and supported fields", () => {
    expect(() => normalizeCollectionExclusionConfig({ keywords: ["a"], fields: ["title"] })).toThrow(/2자/);
    expect(() => normalizeCollectionExclusionConfig({ keywords: ["가".repeat(51)], fields: ["title"] })).toThrow(/50자/);
    expect(() => normalizeCollectionExclusionConfig({ keywords: Array.from({ length: 31 }, (_, i) => `키워드${i}`), fields: ["title"] })).toThrow(/30개/);
    expect(() => normalizeCollectionExclusionConfig({ keywords: ["강사"], fields: ["__proto__" as never] })).toThrow(/지원하지/);
  });

  it("splits comma/newline paste without splitting ordinary spaces", () => {
    expect(splitExclusionKeywordInput("전기, 공인 중개사\n웨이터")).toEqual(["전기", "공인 중개사", "웨이터"]);
  });
});

describe("source-neutral candidate exclusion", () => {
  const config = normalizeCollectionExclusionConfig({ keywords: ["강사", "서울"], fields: ["title", "location"] });
  it("matches any keyword in any selected field and ignores unselected values", () => {
    expect(matchCandidateExclusion({ postingId: "1", listingPage: 1, sourcePosition: 1, title: "AI 강사" }, config)?.matchedField).toBe("title");
    expect(matchCandidateExclusion({ postingId: "2", listingPage: 1, sourcePosition: 2, company: "강사 회사" }, config)).toBeNull();
  });

  it("keeps complete aggregates when samples truncate and sorts keys", () => {
    const candidates = Array.from({ length: 25 }, (_, i) => ({ id: String(i), title: i % 2 ? "전기 기사" : "강사" }));
    const result = applyCandidateExclusions(candidates, normalizeCollectionExclusionConfig({ keywords: ["전기", "강사"], fields: ["title"] }), (item) => ({ postingId: item.id, listingPage: 1, sourcePosition: Number(item.id), title: item.title }));
    expect(result.candidates).toHaveLength(0); expect(result.summary.candidatesExcluded).toBe(25);
    expect(result.summary.excludedCandidateSamples).toHaveLength(20); expect(result.summary.exclusionSamplesTruncated).toBe(true);
    expect(Object.keys(result.summary.exclusionReasonCounts.byKeyword)).toEqual(["강사", "전기"]);
  });

  it("filters Albamon after region matching and before the cap", () => {
    const make = (id: string, position: number, title: string, regionText = "서울 강남구") => ({ sourcePostingId: id, canonicalUrl: `https://www.albamon.com/jobs/detail/${id}`, title,
      companyName: "회사", regionText, salaryText: null, employmentTypes: [], workDaysText: null, workHoursText: null, postingDate: null, deadlineText: null,
      categoryLabels: [], firstSourcePosition: position, observedLinkCount: 1 });
    const page = { pageNumber: 1, candidates: [make("1", 1, "강사"), make("2", 2, "AI 개발"), make("3", 3, "데이터")], classification: "valid_results" } as unknown as AlbamonListingPageResult;
    const selected = selectAlbamonCandidates([page], 2, ["seoul"], normalizeCollectionExclusionConfig({ keywords: ["강사"], fields: ["title"] }));
    expect(selected.exclusion).toMatchObject({ candidatesBeforeExclusion: 3, candidatesExcluded: 1, candidatesAfterExclusion: 2 });
    expect(selected.candidates.map((item) => item.sourcePostingId)).toEqual(["2", "3"]);
  });
});

describe("CLI and authorization contracts", () => {
  it("parses repeated JobKorea flags and default fields", () => {
    const value = parseJobKoreaCollectionArgs(["--preset", "capital-ai", "--pages", "1", "--max-details", "10", "--exclude-keyword", "강사", "--exclude-keyword", "웨이터", "--dry-run", "--confirm"]);
    expect(value.exclusion).toEqual({ keywords: ["강사", "웨이터"], fields: ["title", "category"] });
  });

  it("parses Albamon flags offline and rejects fields without keywords", () => {
    expect(parseAlbamonCollectionArgs(["--preset", "albamon-capital-today", "--exclude-keyword", "강사", "--exclude-field", "title", "--dry-run", "--confirm"]).exclusion?.fields).toEqual(["title"]);
    expect(() => parseAlbamonCollectionArgs(["--preset", "albamon-capital-today", "--exclude-field", "title", "--dry-run", "--confirm"])).toThrow(/FIELDS_WITHOUT_KEYWORDS/);
  });

  it("hashes canonical normalized configuration deterministically and binds order", () => {
    const first = { keywords: ["강사", "웨이터"], fields: ["title" as const] };
    expect(exclusionConfigurationHash(first)).toBe(exclusionConfigurationHash({ keywords: [" 강사 ", "웨이터"], fields: ["title"] }));
    expect(exclusionConfigurationHash(first)).not.toBe(exclusionConfigurationHash({ keywords: ["웨이터", "강사"], fields: ["title"] }));
    expect(canonicalizeExclusionConfig(first)).toContain("강사");
  });

  it("requires typed exclusion arrays and rejects arbitrary nested fields", () => {
    expect(parseCollectionStartBody({ presetId: "capital-ai", pages: 1, maxDetails: 10, mode: "dry_run", exclusion: { keywords: ["강사"], fields: ["title"] } }).exclusion.keywords).toEqual(["강사"]);
    expect(() => parseCollectionStartBody({ presetId: "capital-ai", pages: 1, maxDetails: 10, mode: "dry_run", exclusion: { keywords: [], fields: [], __protoPath: "x" } })).toThrow(/keywords와 fields/);
  });
});
