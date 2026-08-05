import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectFixtureSafety, loadFixture } from "../../services/fixture-loader";
import { parseAlbamonDetail } from "../../sources/albamon/detail-parser";
import { parseAlbamonListing } from "../../sources/albamon/listing-parser";
import { normalizeAlbamon } from "../../sources/albamon/normalize";
import type { AlbamonDetailFixture, AlbamonListingFixture } from "../../sources/albamon/types";

const listingUrl = new URL("../../sources/albamon/fixtures/listing-area-2026-08-05.json", import.meta.url);
const detailUrl = new URL("../../sources/albamon/fixtures/detail-118270285.json", import.meta.url);

describe("알바몬 fixture 계약", () => {
  it("목록 급여 원문과 노출 상태를 보존한다", async () => {
    const page = parseAlbamonListing(await loadFixture<AlbamonListingFixture>(listingUrl));
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.value?.sourcePostingId).toBe("118279576");
    expect(page.items[0]?.value?.salaryText).toBe("시급 14,400원");
    expect(page.items[0]?.value?.promoted).toBe(true);
  });

  it("상세 JSON-LD와 표시 근무조건을 함께 파싱한다", async () => {
    const result = parseAlbamonDetail(await loadFixture<AlbamonDetailFixture>(detailUrl));
    expect(result.value?.sourcePostingId).toBe("118270285");
    expect(result.value?.companyName).toBe("주식회사 피플코리아");
    expect(result.value?.salaryText).toBe("일급 110,000원");
    expect(result.value?.structuredSalaryMinimum).toBe(110_000);
    expect(result.value?.structuredSalaryMaximum).toBe(110_000);
    expect(result.value?.workDaysOriginalText).toBe("월~금");
    expect(result.value?.workStartTime).toBe("08:00");
    expect(result.value?.workEndTime).toBe("17:00");
    expect(result.value?.expiresAt).toBe("2026-08-24");
  });

  it("관찰된 좌표만 CanonicalJob에 남긴다", async () => {
    const fixture = await loadFixture<AlbamonListingFixture>(listingUrl);
    const detail = parseAlbamonDetail(await loadFixture<AlbamonDetailFixture>(detailUrl)).value;
    const listing = {
      sourcePostingId: "118270285", sourceUrl: "https://www.albamon.com/jobs/detail/118270285",
      title: "일급 11만원(당일지급) - 호텔 세탁물 분류,정리 작업", companyName: "주식회사 피플코리아",
      salaryText: "일급 110,000원", regionText: "경기 파주시 법원읍", workDaysText: "월~금",
      workHoursText: "08:00~17:00", employmentTypes: ["알바"], deadlineText: "2026-08-24",
      promoted: null, capturedAt: fixture.metadata.capturedAt,
    };
    expect(detail).not.toBeNull();
    if (!detail) return;
    const job = normalizeAlbamon(listing, detail);
    expect(job.latitude).toBe(37.855262756347656);
    expect(job.longitude).toBe(126.8779525756836);
    expect(job.locationAccuracy).toBe("exact_coordinate");
    expect(job.addressOriginalText).toBe("파주시 법원읍 술이홀로 956");
    expect(job.salary.type).toBe("daily");
  });

  it("좌표가 빠져도 상세 파싱은 실패하지 않는다", async () => {
    const fixture = await loadFixture<AlbamonDetailFixture>(detailUrl);
    if (fixture.visible) { fixture.visible.latitude = null; fixture.visible.longitude = null; }
    const result = parseAlbamonDetail(fixture);
    expect(result.value?.latitude).toBeNull();
    expect(result.value?.roadAddress).toBe("술이홀로 956");
  });

  it("빈 목록과 위치 형태 변경을 진단한다", () => {
    const metadata: AlbamonListingFixture["metadata"] = { source: "albamon", capturedAt: "2026-08-05", sourcePageType: "listing", evidenceType: "observed_html", sanitized: true, notes: [] };
    expect(parseAlbamonListing({ metadata, items: [] }).diagnostics[0]?.code).toBe("ALBAMON_LISTING_ITEMS_EMPTY");
    const detail = parseAlbamonDetail({ metadata: { ...metadata, sourcePageType: "detail" }, sourceUrl: "https://www.albamon.com/jobs/detail/1", jsonLdBlocks: [{ "@type": "JobPosting", jobLocation: [{ broken: true }] }] });
    expect(detail.diagnostics.map((item) => item.code)).toContain("ALBAMON_LOCATION_SHAPE_CHANGED");
  });

  it("fixture에 개인정보·세션·토큰이 없다", async () => {
    for (const url of [listingUrl, detailUrl]) expect(inspectFixtureSafety(await readFile(url, "utf8"))).toEqual([]);
  });
});
