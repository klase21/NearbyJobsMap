import type { LocationAccuracy } from "../domain/location";
import type { SalaryType } from "../domain/salary";
import type { JobFilterState, MapPosition, SortOption, UiJobRecord, UserOrigin } from "../domain/ui-job";
import { haversineDistanceKm } from "./distance";
import { normalizeRegionText, type NormalizedRegion as RegionValue } from "./region-normalizer";
import { matchCandidateExclusion, normalizeCollectionExclusionConfig } from "./collection-exclusion";

export const DEFAULT_FILTERS: JobFilterState = {
  keyword: "", source: "all", provenance: "all", completeness: "all", region: "all", mapEligibility: "all", city: "", district: "", category: "", employmentType: "",
  experienceRequirement: "", educationRequirement: "", salaryType: "all",
  salaryThresholds: { hourly: 0, daily: 0, monthly: 0, annual: 0, normalizedMonthly: 0 },
  postingStatus: "all", locationAccuracy: "all", locationMode: "all", deadline: "all", showDemo: true,
  exclusionKeywords: [], exclusionFields: ["title", "category"],
};

const EXACT_LOCATION = new Set<LocationAccuracy>(["exact_coordinate", "exact_address"]);
const ESTIMATED_LOCATION = new Set<LocationAccuracy>(["neighborhood", "district", "city", "station_area"]);

export function getMapPositions(record: UiJobRecord): MapPosition[] {
  if (record.job.locationAccuracy === "multiple_locations") {
    return record.job.workplaces.flatMap((workplace) => Number.isFinite(workplace.latitude) && Number.isFinite(workplace.longitude) && !workplace.isHeadquartersOnly
      ? [{ latitude: workplace.latitude!, longitude: workplace.longitude!, kind: "exact" as const, provenance: record.isFictional ? "fictional_demo" as const : "source" as const }]
      : []);
  }
  if (["headquarters_only", "location_undecided", "unavailable"].includes(record.job.locationAccuracy)) return [];
  return record.mapPosition ? [record.mapPosition] : [];
}

export function isMapEligible(record: UiJobRecord): boolean {
  return getMapPositions(record).length > 0;
}

const distanceFromOrigin = (record: UiJobRecord, origin: UserOrigin): number | null => {
  const distances = getMapPositions(record).map((position) => haversineDistanceKm(origin, position));
  return distances.length ? Math.min(...distances) : null;
};

export function getNormalizedRegions(record: UiJobRecord): RegionValue[] {
  if (record.normalizedRegions?.length) return record.normalizedRegions;
  const evidence = [record.job.addressOriginalText, record.job.city, record.job.district, ...record.job.workplaces.map((item) => item.originalText)].filter(Boolean).join(" ");
  return normalizeRegionText(evidence).regions;
}

export function getRegionGroup(record: UiJobRecord): "서울" | "경기" | null {
  const regions = getNormalizedRegions(record);
  return regions.includes("seoul") ? "서울" : regions.includes("gyeonggi") ? "경기" : null;
}

export function countActiveFilters(filters: JobFilterState): number {
  return [filters.keyword.trim(), filters.source !== "all", filters.provenance !== "all", filters.completeness !== "all", filters.region !== "all",
    filters.mapEligibility !== "all", filters.city, filters.district, filters.category, filters.employmentType, filters.experienceRequirement,
    filters.educationRequirement, filters.salaryType !== "all", filters.postingStatus !== "all", filters.locationAccuracy !== "all",
    filters.locationMode !== "all", filters.deadline !== "all", !filters.showDemo,
    Object.values(filters.salaryThresholds).some((value) => value > 0), filters.exclusionKeywords.length > 0].filter(Boolean).length;
}

function salaryThresholdMatches(record: UiJobRecord, filters: JobFilterState): boolean {
  const thresholds = filters.salaryThresholds;
  if (thresholds.normalizedMonthly > 0 && (record.job.salary.normalizedMonthlyMinimum ?? -1) < thresholds.normalizedMonthly) return false;
  const thresholdByType: Partial<Record<SalaryType, number>> = {
    hourly: thresholds.hourly, daily: thresholds.daily, monthly: thresholds.monthly, annual: thresholds.annual,
  };
  if (filters.salaryType !== "all") {
    const selectedThreshold = thresholdByType[filters.salaryType] ?? 0;
    return selectedThreshold <= 0 || (record.job.salary.minimumAmount !== null && record.job.salary.minimumAmount >= selectedThreshold);
  }
  const originalActive = thresholds.hourly > 0 || thresholds.daily > 0 || thresholds.monthly > 0 || thresholds.annual > 0;
  if (!originalActive) return true;
  const threshold = thresholdByType[record.job.salary.type];
  return Boolean(threshold && record.job.salary.minimumAmount !== null && record.job.salary.minimumAmount >= threshold);
}

function deadlineMatches(record: UiJobRecord, filter: JobFilterState["deadline"], now: Date): boolean {
  if (filter === "all") return true;
  if (filter === "no_deadline") return !record.job.expiresAt;
  if (!record.job.expiresAt) return false;
  const remaining = new Date(record.job.expiresAt).getTime() - now.getTime();
  const days = filter === "within_3_days" ? 3 : 7;
  return remaining >= 0 && remaining <= days * 86_400_000;
}

export function filterJobs(records: UiJobRecord[], filters: JobFilterState, now: Date): UiJobRecord[] {
  const query = filters.keyword.trim().toLocaleLowerCase("ko");
  let exclusion = { keywords: [] as string[], fields: [] as typeof filters.exclusionFields };
  try { exclusion = normalizeCollectionExclusionConfig({ keywords: filters.exclusionKeywords, fields: filters.exclusionFields }); } catch { /* Invalid stored UI values match nothing. */ }
  return records.filter((record) => {
    const job = record.job;
    if (!filters.showDemo && record.isFictional) return false;
    if (filters.source !== "all" && job.source !== filters.source) return false;
    if (filters.provenance === "manual" && record.observationKind !== "bounded_manual_collection" && record.observationKind !== "bounded_listing_collection") return false;
    if (filters.provenance === "fixture" && record.provenanceKind !== "fixture_derived") return false;
    if (filters.provenance === "demo" && !record.isFictional) return false;
    if (filters.completeness === "listing_only" && record.observationKind !== "bounded_listing_collection") return false;
    if (filters.completeness === "detail_complete" && record.observationKind !== "bounded_manual_collection") return false;
    const normalizedRegions = getNormalizedRegions(record);
    if (filters.region === "seoul" && !normalizedRegions.includes("seoul")) return false;
    if (filters.region === "gyeonggi" && !normalizedRegions.includes("gyeonggi")) return false;
    if (filters.region === "other" && !normalizedRegions.some((region) => region === "other" || region === "incheon")) return false;
    if (filters.region === "unknown" && normalizedRegions.length > 0) return false;
    if (filters.mapEligibility === "map" && !isMapEligible(record)) return false;
    if (filters.mapEligibility === "list_only" && isMapEligible(record)) return false;
    if (filters.city && job.city !== filters.city) return false;
    if (filters.district && job.district !== filters.district) return false;
    if (filters.category && !job.categories.includes(filters.category)) return false;
    if (filters.employmentType && !job.employmentTypes.includes(filters.employmentType)) return false;
    if (filters.experienceRequirement && job.experienceRequirement !== filters.experienceRequirement) return false;
    if (filters.educationRequirement && job.educationRequirement !== filters.educationRequirement) return false;
    if (filters.salaryType !== "all" && job.salary.type !== filters.salaryType) return false;
    if (filters.postingStatus !== "all" && job.postingStatus !== filters.postingStatus) return false;
    if (filters.locationAccuracy !== "all" && job.locationAccuracy !== filters.locationAccuracy) return false;
    if (filters.locationMode === "exact" && !EXACT_LOCATION.has(job.locationAccuracy)) return false;
    if (filters.locationMode === "estimated" && !ESTIMATED_LOCATION.has(job.locationAccuracy)) return false;
    if (!salaryThresholdMatches(record, filters) || !deadlineMatches(record, filters.deadline, now)) return false;
    if (query) {
      const values = [job.title, job.companyName, job.addressOriginalText, job.city, job.district, job.neighborhood, job.nearestStation,
        ...job.categories, ...job.employmentTypes, job.source, job.source === "jobkorea" ? "잡코리아" : job.source === "albamon" ? "알바몬" : ""];
      if (!values.some((value) => (value ?? "").toLocaleLowerCase("ko").includes(query))) return false;
    }
    if (exclusion.keywords.length && matchCandidateExclusion({ postingId: job.sourcePostingId, listingPage: 0, sourcePosition: 0,
      title: job.title, company: job.companyName, location: job.addressOriginalText, categories: job.categories,
      employmentTypes: job.employmentTypes, workSchedule: [job.workDaysOriginalText, job.workStartTime, job.workEndTime].filter((value): value is string => Boolean(value)) }, exclusion)) return false;
    return true;
  });
}

function compareNumbers(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

const salaryValue = (record: UiJobRecord, type: SalaryType): number | null => record.job.salary.type === type ? record.job.salary.maximumAmount : null;
const dateValue = (value: string | null): number | null => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).getTime() : null;

export function sortJobs(records: UiJobRecord[], sort: SortOption, origin: UserOrigin): UiJobRecord[] {
  return records.map((record, index) => ({ record, index })).sort((a, b) => {
    let result = 0;
    switch (sort) {
      case "newest": result = compareNumbers(dateValue(a.record.job.postedAt), dateValue(b.record.job.postedAt), "desc"); break;
      case "deadline": result = compareNumbers(dateValue(a.record.job.expiresAt), dateValue(b.record.job.expiresAt), "asc"); break;
      case "distance": result = compareNumbers(distanceFromOrigin(a.record, origin), distanceFromOrigin(b.record, origin), "asc"); break;
      case "hourly": result = compareNumbers(salaryValue(a.record, "hourly"), salaryValue(b.record, "hourly"), "desc"); break;
      case "daily": result = compareNumbers(salaryValue(a.record, "daily"), salaryValue(b.record, "daily"), "desc"); break;
      case "monthly": result = compareNumbers(salaryValue(a.record, "monthly"), salaryValue(b.record, "monthly"), "desc"); break;
      case "annual": result = compareNumbers(salaryValue(a.record, "annual"), salaryValue(b.record, "annual"), "desc"); break;
      case "normalized_monthly": result = compareNumbers(a.record.job.salary.normalizedMonthlyMaximum, b.record.job.salary.normalizedMonthlyMaximum, "desc"); break;
      case "company": result = a.record.job.companyName.localeCompare(b.record.job.companyName, "ko"); break;
    }
    return result || a.index - b.index;
  }).map(({ record }) => record);
}

export function reconcileSelectedJobId(selectedJobId: string | null, visibleIds: string[]): string | null {
  if (selectedJobId && visibleIds.includes(selectedJobId)) return selectedJobId;
  return visibleIds[0] ?? null;
}

export function getJobDataLabel(record: UiJobRecord): "기능 검증용 가상 공고" | "정제된 공개 fixture" | "원샷 전송 검증 데이터" | "수동 수집" {
  if (record.observationKind === "bounded_manual_collection" || record.observationKind === "bounded_listing_collection") return "수동 수집";
  if (record.provenanceKind === "live_one_shot_observation") return "원샷 전송 검증 데이터";
  return record.isFictional ? "기능 검증용 가상 공고" : "정제된 공개 fixture";
}
