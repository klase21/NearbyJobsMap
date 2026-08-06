import type { JobFilterState, SavedPreferences, SortOption, UserJobStatus, UserOrigin } from "../domain/ui-job";
import { validateOrigin } from "../services/distance";
import { DEFAULT_FILTERS } from "../services/job-search";
import { EXCLUSION_FIELDS, normalizeExclusionText, type ExclusionField } from "../services/collection-exclusion";

export const PREFERENCES_STORAGE_KEY = "nearby-jobs-map:preferences:v1";
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface PreferencesLoadResult { value: SavedPreferences; corrupted: boolean }

const SORT_OPTIONS = new Set<SortOption>(["newest", "deadline", "distance", "hourly", "daily", "monthly", "annual", "normalized_monthly", "company"]);
const USER_STATUSES = new Set<UserJobStatus>(["reviewing", "saved", "planned", "applied", "excluded"]);
const FILTER_OPTIONS = {
  source: new Set(["all", "jobkorea", "albamon"]),
  provenance: new Set(["all", "manual", "fixture", "demo"]),
  completeness: new Set(["all", "listing_only", "detail_complete"]),
  region: new Set(["all", "seoul", "gyeonggi", "other", "unknown"]),
  mapEligibility: new Set(["all", "map", "list_only"]),
  salaryType: new Set(["all", "hourly", "daily", "weekly", "monthly", "annual", "per_task", "negotiable", "company_policy", "mixed", "unknown"]),
  postingStatus: new Set(["all", "active", "closing_soon", "expired", "closed", "removed", "unknown"]),
  locationAccuracy: new Set(["all", "exact_coordinate", "exact_address", "neighborhood", "district", "city", "station_area", "multiple_locations", "headquarters_only", "location_undecided", "unavailable"]),
  locationMode: new Set(["all", "exact", "estimated"]),
  deadline: new Set(["all", "within_3_days", "within_7_days", "no_deadline"]),
} as const;
export const DEFAULT_ORIGIN: UserOrigin = { name: "출발지 예시 · 범계역", latitude: 37.3897, longitude: 126.9506, example: true };
export const DEFAULT_PREFERENCES: SavedPreferences = { filters: DEFAULT_FILTERS, sort: "newest", mapVisible: true, origin: DEFAULT_ORIGIN, userJobStatuses: {} };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateJobFilterState(value: unknown): value is JobFilterState {
  if (!isRecord(value) || !isRecord(value.salaryThresholds)) return false;
  if (Object.keys(value).some((key) => !(key in DEFAULT_FILTERS))) return false;
  const salaryThresholds = value.salaryThresholds;
  if (Object.keys(salaryThresholds).some((key) => !(key in DEFAULT_FILTERS.salaryThresholds))) return false;
  const strings = ["keyword", "source", "provenance", "completeness", "region", "mapEligibility", "city", "district", "category", "employmentType", "experienceRequirement", "educationRequirement", "salaryType", "postingStatus", "locationAccuracy", "locationMode", "deadline"];
  return strings.every((key) => typeof value[key] === "string") && typeof value.showDemo === "boolean"
    && Array.isArray(value.exclusionKeywords) && value.exclusionKeywords.every((item) => typeof item === "string")
    && Array.isArray(value.exclusionFields) && value.exclusionFields.every((item) => typeof item === "string" && EXCLUSION_FIELDS.includes(item as ExclusionField))
    && Object.entries(FILTER_OPTIONS).every(([key, options]) => options.has(value[key] as never))
    && ["hourly", "daily", "monthly", "annual", "normalizedMonthly"].every((key) => typeof salaryThresholds[key] === "number" && Number.isFinite(salaryThresholds[key]) && (salaryThresholds[key] as number) >= 0);
}

function validOrigin(value: unknown): value is UserOrigin {
  return isRecord(value) && typeof value.name === "string" && typeof value.latitude === "number" && typeof value.longitude === "number"
    && typeof value.example === "boolean" && validateOrigin({ name: value.name, latitude: value.latitude, longitude: value.longitude }).length === 0;
}

function parsePreferences(raw: string): SavedPreferences | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || ![1, 2, 3].includes(parsed.version as number) || !isRecord(parsed.value)) return null;
    const value = parsed.value;
    const rawFilters = isRecord(value.filters) ? value.filters : null;
    const filters = rawFilters ? { ...DEFAULT_FILTERS, ...rawFilters,
      exclusionKeywords: Array.isArray(rawFilters.exclusionKeywords) ? [...new Set(rawFilters.exclusionKeywords.filter((item): item is string => typeof item === "string").map(normalizeExclusionText).filter((item) => item.length >= 2 && item.length <= 50))].slice(0, 30) : [],
      exclusionFields: Array.isArray(rawFilters.exclusionFields) ? rawFilters.exclusionFields.filter((item): item is ExclusionField => typeof item === "string" && EXCLUSION_FIELDS.includes(item as ExclusionField)) : DEFAULT_FILTERS.exclusionFields,
      salaryThresholds: isRecord(rawFilters.salaryThresholds) ? { ...DEFAULT_FILTERS.salaryThresholds, ...rawFilters.salaryThresholds } : DEFAULT_FILTERS.salaryThresholds } : null;
    if (!validateJobFilterState(filters) || typeof value.sort !== "string" || !SORT_OPTIONS.has(value.sort as SortOption)
      || typeof value.mapVisible !== "boolean" || !validOrigin(value.origin) || !isRecord(value.userJobStatuses)) return null;
    const statuses = Object.fromEntries(Object.entries(value.userJobStatuses).filter((entry): entry is [string, UserJobStatus] => typeof entry[1] === "string" && USER_STATUSES.has(entry[1] as UserJobStatus)));
    return { filters, sort: value.sort as SortOption, mapVisible: value.mapVisible, origin: value.origin, userJobStatuses: statuses };
  } catch { return null; }
}

export function createPreferencesRepository(storage: StorageLike | null) {
  return {
    load(): PreferencesLoadResult {
      if (!storage) return { value: DEFAULT_PREFERENCES, corrupted: false };
      const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
      if (raw === null) return { value: DEFAULT_PREFERENCES, corrupted: false };
      const value = parsePreferences(raw);
      return value ? { value, corrupted: false } : { value: DEFAULT_PREFERENCES, corrupted: true };
    },
    save(value: SavedPreferences): boolean {
      if (!storage) return false;
      try { storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 3, value })); return true; } catch { return false; }
    },
    clear(): void { storage?.removeItem(PREFERENCES_STORAGE_KEY); },
  };
}
