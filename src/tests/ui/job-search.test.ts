import { describe, expect, it } from "vitest";
import type { CanonicalJob } from "../../domain/canonical-job";
import type { JobFilterState, UiJobRecord } from "../../domain/ui-job";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";
import { DEFAULT_FILTERS, filterJobs, getJobDataLabel, isMapEligible, reconcileSelectedJobId, sortJobs } from "../../services/job-search";
import { DEFAULT_ORIGIN } from "../../repositories/preferences-repository";
import { canonicalJob } from "../factories";

const record = (overrides: Partial<CanonicalJob> = {}, fictional = false, coords?: [number, number]): UiJobRecord => ({
  job: canonicalJob(overrides), isFictional: fictional, safeSourceUrl: fictional ? null : overrides.sourceUrl ?? canonicalJob().sourceUrl,
  mapPosition: coords ? { latitude: coords[0], longitude: coords[1], kind: "exact", provenance: fictional ? "fictional_demo" : "source" } : null,
});
const filters = (overrides: Partial<JobFilterState> = {}): JobFilterState => ({ ...DEFAULT_FILTERS, ...overrides, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, ...overrides.salaryThresholds } });
const now = new Date("2026-08-05T00:00:00Z");

describe("UI 공고 필터", () => {
  const jobs = [
    record({ id: "jobkorea:1", title: "주방 보조", companyName: "새봄물류", source: "jobkorea", categories: ["외식"], employmentTypes: ["정규직"], city: "서울", district: "강남구", addressOriginalText: "서울 강남구", postingStatus: "active", locationAccuracy: "exact_address" }),
    record({ id: "albamon:2", source: "albamon", title: "물류 포장", companyName: "한결유통", categories: ["물류"], employmentTypes: ["아르바이트"], city: "안양시", district: "동안구", addressOriginalText: "경기 안양시 동안구", postingStatus: "closing_soon", locationAccuracy: "district" }, true),
  ];
  it("키워드", () => expect(filterJobs(jobs, filters({ keyword: "한결" }), now).map((item) => item.job.id)).toEqual(["albamon:2"]));
  it("소스", () => expect(filterJobs(jobs, filters({ source: "jobkorea" }), now)).toHaveLength(1));
  it("서울·경기", () => expect(filterJobs(jobs, filters({ region: "경기" }), now)[0]?.job.id).toBe("albamon:2"));
  it("직종", () => expect(filterJobs(jobs, filters({ category: "물류" }), now)).toHaveLength(1));
  it("고용형태", () => expect(filterJobs(jobs, filters({ employmentType: "정규직" }), now)).toHaveLength(1));
  it("공고 상태", () => expect(filterJobs(jobs, filters({ postingStatus: "closing_soon" }), now)).toHaveLength(1));
  it("위치 정확도", () => expect(filterJobs(jobs, filters({ locationAccuracy: "district" }), now)).toHaveLength(1));
  it("복수 근무지와 근무지 미정을 각각 구분", () => {
    const locations = [record({ id: "multiple", locationAccuracy: "multiple_locations", workplaceCount: 2 }), record({ id: "undecided", locationAccuracy: "location_undecided", workplaceCount: null })];
    expect(filterJobs(locations, filters({ locationAccuracy: "multiple_locations" }), now)[0]?.job.id).toBe("multiple");
    expect(filterJobs(locations, filters({ locationAccuracy: "location_undecided" }), now)[0]?.job.id).toBe("undecided");
  });
  it("가상 공고 숨김", () => expect(filterJobs(jobs, filters({ showDemo: false }), now).map((item) => item.job.id)).toEqual(["jobkorea:1"]));
});

describe("급여 단위 필터와 정렬", () => {
  const salaryRecord = (id: string, expression: string) => record({ id, sourcePostingId: id, salary: normalizeSalary(parseSalary(expression)) });
  const salaries = [salaryRecord("hourly", "시급 13,500원"), salaryRecord("daily", "일급 150,000원"), salaryRecord("monthly", "월급 280만원"), salaryRecord("annual", "연봉 4,200만원"), salaryRecord("missing", "회사 내규에 따름")];
  it("급여 유형", () => expect(filterJobs(salaries, filters({ salaryType: "hourly" }), now)[0]?.job.id).toBe("hourly"));
  it("시급 임계값", () => expect(filterJobs(salaries, filters({ salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, hourly: 13_000 } }), now).map((item) => item.job.id)).toEqual(["hourly"]));
  it("일급 임계값", () => expect(filterJobs(salaries, filters({ salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, daily: 140_000 } }), now).map((item) => item.job.id)).toEqual(["daily"]));
  it("월급 임계값", () => expect(filterJobs(salaries, filters({ salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, monthly: 2_800_000 } }), now).map((item) => item.job.id)).toEqual(["monthly"]));
  it("연봉 임계값", () => expect(filterJobs(salaries, filters({ salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, annual: 40_000_000 } }), now).map((item) => item.job.id)).toEqual(["annual"]));
  it("월 환산 예상금액 내림차순", () => expect(sortJobs(salaries, "normalized_monthly", DEFAULT_ORIGIN).at(-1)?.job.id).toBe("missing"));
  it("해당 단위가 없는 급여는 단위 정렬 끝", () => expect(sortJobs(salaries, "hourly", DEFAULT_ORIGIN)[0]?.job.id).toBe("hourly"));
});

describe("거리와 선택 동기화", () => {
  const near = record({ id: "near" }, true, [37.39, 126.95]);
  const far = record({ id: "far" }, true, [37.56, 127.1]);
  const missing = record({ id: "missing" });
  it("가까운 순이며 좌표 없는 공고는 끝", () => expect(sortJobs([far, missing, near], "distance", DEFAULT_ORIGIN).map((item) => item.job.id)).toEqual(["near", "far", "missing"]));
  it("선택 공고가 남아 있으면 유지", () => expect(reconcileSelectedJobId("far", ["near", "far"])).toBe("far"));
  it("선택 공고가 사라지면 첫 공고", () => expect(reconcileSelectedJobId("gone", ["near", "far"])).toBe("near"));
  it("가상 공고 배지 로직", () => expect(getJobDataLabel(near)).toBe("기능 검증용 가상 공고"));
  it("미정·복수 위치는 좌표가 섞여도 지도 대상이 아니다", () => {
    expect(isMapEligible(record({ locationAccuracy: "location_undecided" }, true, [37.5, 127]))).toBe(false);
    expect(isMapEligible(record({ locationAccuracy: "multiple_locations" }, true, [37.5, 127]))).toBe(false);
  });
  it("복수 근무지는 개별 workplace에 관찰 좌표가 있을 때만 지도 대상", () => {
    const multiple = record({ locationAccuracy: "multiple_locations", workplaceCount: 2, workplaces: [
      { originalText: "서울 영등포구", roadAddress: null, parcelAddress: null, city: "서울", district: "영등포구", neighborhood: null, nearestStation: null, latitude: 37.52, longitude: 126.91, accuracy: "exact_coordinate", isHeadquartersOnly: false },
      { originalText: "경기 안양시", roadAddress: null, parcelAddress: null, city: "경기", district: "안양시", neighborhood: null, nearestStation: null, latitude: null, longitude: null, accuracy: "district", isHeadquartersOnly: false },
    ] });
    expect(isMapEligible(multiple)).toBe(true);
  });
});
