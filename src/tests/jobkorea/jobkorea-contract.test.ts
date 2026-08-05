import { describe, expect, it } from "vitest";
import { parseJobKoreaDetail } from "../../sources/jobkorea/detail-parser";
import { parseJobKoreaListing } from "../../sources/jobkorea/listing-parser";
import { normalizeJobKorea } from "../../sources/jobkorea/normalize";
import type { JobKoreaDetailFixture, JobKoreaListingFixture } from "../../sources/jobkorea/types";
import { inspectFixtureSafety, loadFixture } from "../../services/fixture-loader";
import { readFile } from "node:fs/promises";

const listingUrl = new URL("../../sources/jobkorea/fixtures/listing-seoul-2026-08-05.json", import.meta.url);
const detailUrl = new URL("../../sources/jobkorea/fixtures/detail-49715720.json", import.meta.url);
const closedUrl = new URL("../../sources/jobkorea/fixtures/detail-48997208-closed.json", import.meta.url);

describe("잡코리아 fixture 계약", () => {
  it("목록 fixture를 항목별로 격리해 파싱한다", async () => {
    const fixture = await loadFixture<JobKoreaListingFixture>(listingUrl);
    const page = parseJobKoreaListing(fixture);
    expect(page.items).toHaveLength(3);
    expect(page.items.every((item) => item.value !== null)).toBe(true);
    expect(page.items[2]?.value?.sourcePostingId).toBe("49715720");
  });

  it("복수 JSON-LD 중 JobPosting을 선택하고 표시 원문을 보존한다", async () => {
    const fixture = await loadFixture<JobKoreaDetailFixture>(detailUrl);
    const result = parseJobKoreaDetail(fixture);
    expect(result.value?.sourcePostingId).toBe("49715720");
    expect(result.value?.title).toContain("발관리");
    expect(result.value?.companyName).toBe("푸스케어 청량리역점");
    expect(result.value?.salaryText).toBe("월급 220~450만원 (면접 후 결정)");
    expect(result.value?.addressOriginalText).toContain("서울시립대로 94");
    expect(result.value?.expiresAt).toBe("2026-09-03T23:59");
  });

  it("정규화해 원문 급여·주소와 exact_address를 유지한다", async () => {
    const listing = parseJobKoreaListing(await loadFixture<JobKoreaListingFixture>(listingUrl)).items[2]?.value;
    const detail = parseJobKoreaDetail(await loadFixture<JobKoreaDetailFixture>(detailUrl)).value;
    expect(listing).not.toBeNull(); expect(detail).not.toBeNull();
    if (!listing || !detail) return;
    const job = normalizeJobKorea(listing, detail);
    expect(job.salary.originalText).toBe("월급 220~450만원 (면접 후 결정)");
    expect(job.salary.type).toBe("monthly");
    expect(job.salary.minimumAmount).toBe(2_200_000);
    expect(job.salary.maximumAmount).toBe(4_500_000);
    expect(job.addressOriginalText).toContain("전농동");
    expect(job.latitude).toBeNull();
    expect(job.locationAccuracy).toBe("exact_address");
  });

  it("JSON-LD 없는 마감 상세도 진단과 함께 파싱한다", async () => {
    const result = parseJobKoreaDetail(await loadFixture<JobKoreaDetailFixture>(closedUrl));
    expect(result.value?.sourcePostingId).toBe("48997208");
    expect(result.value?.explicitClosed).toBe(true);
    expect(result.diagnostics.map((item) => item.code)).toContain("JOBKOREA_DETAIL_JSONLD_MISSING");
  });

  it("빈 목록과 선택 필드 결손을 명확히 진단한다", () => {
    const empty = parseJobKoreaListing({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "listing", evidenceType: "observed_html", sanitized: true, notes: [] }, items: [] });
    expect(empty.diagnostics[0]?.code).toBe("JOBKOREA_LISTING_ITEMS_EMPTY");
    const malformed = parseJobKoreaDetail({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "detail", evidenceType: "observed_html", sanitized: true, notes: [] }, sourceUrl: "https://example.test/missing", jsonLdBlocks: [{ "@type": "Other" }] });
    expect(malformed.diagnostics.map((item) => item.code)).toContain("SOURCE_POSTING_ID_MISSING");
  });

  it("fixture에 연락처·세션·토큰이 없다", async () => {
    for (const url of [listingUrl, detailUrl, closedUrl]) expect(inspectFixtureSafety(await readFile(url, "utf8"))).toEqual([]);
  });
});
