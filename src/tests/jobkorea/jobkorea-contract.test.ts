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
const annualUrl = new URL("../../sources/jobkorea/fixtures/detail-49090158-annual.json", import.meta.url);
const headquartersUrl = new URL("../../sources/jobkorea/fixtures/detail-49493208-headquarters-separated.json", import.meta.url);

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

  it("관찰된 연봉 범위를 만원 단위 손실 없이 정규화한다", async () => {
    const detail = parseJobKoreaDetail(await loadFixture<JobKoreaDetailFixture>(annualUrl));
    expect(detail.diagnostics.map((item) => item.code)).not.toContain("JOBKOREA_ANNUAL_SALARY_SHAPE_CHANGED");
    expect(detail.value?.salaryText).toBe("연봉 3,000~3,300만원 (면접 후 결정)");
    const listing = { sourcePostingId: "49090158", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/49090158", title: "PC유지보수 파견직원 모집", companyName: "엔플러스시스템즈", salaryText: null, regionText: "서울 영등포구", categories: ["IT"], employmentTypes: [], experienceRequirement: null, educationRequirement: null, postedAt: null, deadlineText: null, promoted: null, capturedAt: "2026-08-05T13:30:00+09:00" };
    const job = normalizeJobKorea(listing, detail.value ?? undefined);
    expect(job.salary).toMatchObject({ type: "annual", minimumAmount: 30_000_000, maximumAmount: 33_000_000, normalizedMonthlyMinimum: 2_500_000, normalizedMonthlyMaximum: 2_750_000 });
  });

  it("기업정보 주소를 근무지로 섞지 않고 구조화 근무지 하나만 보존한다", async () => {
    const detail = parseJobKoreaDetail(await loadFixture<JobKoreaDetailFixture>(headquartersUrl)).value;
    expect(detail?.workplaces).toHaveLength(1);
    expect(detail?.workplaces[0]?.originalText).toContain("진천군");
    expect(detail?.workplaces.some((place) => place.originalText.includes("개포로"))).toBe(false);
  });

  it("복수 근무지 계약의 배열 누락과 수 불일치를 구체적으로 진단한다", () => {
    const result = parseJobKoreaDetail({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "detail", evidenceType: "observed_html", sanitized: true, contractCases: ["multiple_locations"], notes: [] }, sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1", visible: { addressText: "서울 외 1", workplaceCount: 2 } });
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["JOBKOREA_MULTIPLE_WORKPLACES_UNSUPPORTED", "JOBKOREA_WORKPLACE_COUNT_AMBIGUOUS"]));
  });

  it("복수 근무지는 배열로 유지하고 단일 주소·좌표로 축소하지 않는다", () => {
    const result = parseJobKoreaDetail({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "detail", evidenceType: "observed_html", sanitized: true, notes: [] }, sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/2", visible: { addressText: "서울 영등포구 · 경기 안양시", workplaceCount: 2, workplaces: [
      { originalText: "서울 영등포구", roadAddress: null, city: "서울", district: "영등포구", neighborhood: null, nearestStation: null, latitude: null, longitude: null },
      { originalText: "경기 안양시", roadAddress: null, city: "경기", district: "안양시", neighborhood: null, nearestStation: null, latitude: null, longitude: null },
    ] } });
    const listing = { sourcePostingId: "2", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/2", title: "검증 입력", companyName: "검증 회사", salaryText: null, regionText: null, categories: [], employmentTypes: [], experienceRequirement: null, educationRequirement: null, postedAt: null, deadlineText: null, promoted: null, capturedAt: "2026-08-05" };
    const job = normalizeJobKorea(listing, result.value ?? undefined);
    expect(job.workplaces.map((place) => place.originalText)).toEqual(["서울 영등포구", "경기 안양시"]);
    expect(job.locationAccuracy).toBe("multiple_locations");
    expect(job.roadAddress).toBeNull(); expect(job.latitude).toBeNull(); expect(job.longitude).toBeNull();
  });

  it("연봉 계약의 구조화 단위 변경을 진단해도 페이지 파싱은 유지한다", () => {
    const result = parseJobKoreaDetail({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "detail", evidenceType: "observed_json_ld", sanitized: true, contractCases: ["annual_salary"], notes: [] }, sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/3", jsonLdBlocks: [{ "@type": "JobPosting", baseSalary: { value: { value: "not-number", unitText: "MONTH" } } }] });
    expect(result.value?.sourcePostingId).toBe("3");
    expect(result.diagnostics.map((item) => item.code)).toContain("JOBKOREA_ANNUAL_SALARY_SHAPE_CHANGED");
  });

  it("빈 목록과 선택 필드 결손을 명확히 진단한다", () => {
    const empty = parseJobKoreaListing({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "listing", evidenceType: "observed_html", sanitized: true, notes: [] }, items: [] });
    expect(empty.diagnostics[0]?.code).toBe("JOBKOREA_LISTING_ITEMS_EMPTY");
    const malformed = parseJobKoreaDetail({ metadata: { source: "jobkorea", capturedAt: "2026-08-05", sourcePageType: "detail", evidenceType: "observed_html", sanitized: true, notes: [] }, sourceUrl: "https://example.test/missing", jsonLdBlocks: [{ "@type": "Other" }] });
    expect(malformed.diagnostics.map((item) => item.code)).toContain("SOURCE_POSTING_ID_MISSING");
  });

  it("fixture에 연락처·세션·토큰이 없다", async () => {
    for (const url of [listingUrl, detailUrl, closedUrl, annualUrl, headquartersUrl]) expect(inspectFixtureSafety(await readFile(url, "utf8"))).toEqual([]);
  });
});
