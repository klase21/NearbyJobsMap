import { describe, expect, it } from "vitest";
import { JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT, summarizeJobKoreaFailedResources, validateJobKoreaFailedResourceSummary } from "../../sources/jobkorea/transport/jobkorea-resource-diagnostics";

describe("잡코리아 failed-resource sanitized summary", () => {
  it("total/type counts와 bounded samples를 결정적으로 보존한다", () => {
    const inputs = [
      { resourceType: "document", url: "https://www.jobkorea.co.kr/Search?token=secret", failureCode: "net::ERR_FAILED" },
      ...Array.from({ length: 6 }, (_, index) => ({ resourceType: index % 2 ? "image" : "font",
        url: `https://tracking.example.test/pixel?private=${index}`, failureCode: "net::ERR_ABORTED" })),
    ];
    const result = summarizeJobKoreaFailedResources(inputs, false);
    expect(result).toMatchObject({ totalCount: 7, samplesTruncated: true, preventedReadinessOrExtraction: false,
      typeCounts: { document: 1, font: 3, image: 3 } });
    expect(result.samples).toHaveLength(JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT);
    expect(result.samples[0]).toEqual({ resourceType: "document", hostCategory: "jobkorea",
      failureCode: "net::ERR_FAILED", navigationCritical: true });
    expect(JSON.stringify(result)).not.toMatch(/token=|private=|headers|responseBody/);
  });

  it("unknown resource type과 malformed URL을 broad category로 축약한다", () => {
    expect(summarizeJobKoreaFailedResources([{ resourceType: "manifest", url: "not a url", failureCode: " x ".repeat(100) }], null))
      .toMatchObject({ typeCounts: { other: 1 }, samples: [{ resourceType: "other", hostCategory: "invalid",
        navigationCritical: false }] });
  });

  it("type 합계·sample cap이 깨진 summary를 명시적 diagnostic으로 거부한다", () => {
    expect(() => validateJobKoreaFailedResourceSummary({ totalCount: 2, typeCounts: { image: 1 }, samples: [],
      samplesTruncated: false, preventedReadinessOrExtraction: null }))
      .toThrowError(expect.objectContaining({ code: "JOBKOREA_FAILED_RESOURCE_SUMMARY_INVALID" }));
    expect(() => validateJobKoreaFailedResourceSummary({ totalCount: 0, typeCounts: {}, samples: [],
      samplesTruncated: true, preventedReadinessOrExtraction: false }))
      .toThrowError(expect.objectContaining({ code: "JOBKOREA_FAILED_RESOURCE_SUMMARY_INVALID" }));
  });
});
