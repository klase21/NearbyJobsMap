import type { JobFilterState, SavedPreferences, SortOption, UserJobStatus, UserOrigin } from "../domain/ui-job";
import { validateOrigin } from "../services/distance";
import { DEFAULT_FILTERS } from "../services/job-search";

export const PREFERENCES_STORAGE_KEY = "nearby-jobs-map:preferences:v1";
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface PreferencesLoadResult { value: SavedPreferences; corrupted: boolean }

const SORT_OPTIONS = new Set<SortOption>(["newest", "deadline", "distance", "hourly", "daily", "monthly", "annual", "normalized_monthly", "company"]);
const USER_STATUSES = new Set<UserJobStatus>(["reviewing", "saved", "planned", "applied", "excluded"]);
const FILTER_OPTIONS = {
  source: new Set(["all", "jobkorea", "albamon"]),
  region: new Set(["all", "서울", "경기"]),
  salaryType: new Set(["all", "hourly", "daily", "weekly", "monthly", "annual", "per_task", "negotiable", "company_policy", "mixed", "unknown"]),
  postingStatus: new Set(["all", "active", "closing_soon", "expired", "closed", "removed", "unknown"]),
  locationAccuracy: new Set(["all", "exact_coordinate", "exact_address", "neighborhood", "district", "city", "station_area", "multiple_locations", "headquarters_only", "location_undecided", "unavailable"]),
  locationMode: new Set(["all", "exact", "estimated"]),
  deadline: new Set(["all", "within_3_days", "within_7_days", "no_deadline"]),
} as const;
export const DEFAULT_ORIGIN: UserOrigin = { name: "출발지 예시 · 범계역", latitude: 37.3897, longitude: 126.9506, example: true };
export const DEFAULT_PREFERENCES: SavedPreferences = { filters: DEFAULT_FILTERS, sort: "newest", mapVisible: true, origin: DEFAULT_ORIGIN, userJobStatuses: {} };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function validFilters(value: unknown): value is JobFilterState {
  if (!isRecord(value) || !isRecord(value.salaryThresholds)) return false;
  const salaryThresholds = value.salaryThresholds;
  const strings = ["keyword", "source", "region", "city", "district", "category", "employmentType", "experienceRequirement", "educationRequirement", "salaryType", "postingStatus", "locationAccuracy", "locationMode", "deadline"];
  return strings.every((key) => typeof value[key] === "string") && typeof value.showDemo === "boolean"
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
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.value)) return null;
    const value = parsed.value;
    if (!validFilters(value.filters) || typeof value.sort !== "string" || !SORT_OPTIONS.has(value.sort as SortOption)
      || typeof value.mapVisible !== "boolean" || !validOrigin(value.origin) || !isRecord(value.userJobStatuses)) return null;
    const statuses = Object.fromEntries(Object.entries(value.userJobStatuses).filter((entry): entry is [string, UserJobStatus] => typeof entry[1] === "string" && USER_STATUSES.has(entry[1] as UserJobStatus)));
    return { filters: value.filters, sort: value.sort as SortOption, mapVisible: value.mapVisible, origin: value.origin, userJobStatuses: statuses };
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
      try { storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, value })); return true; } catch { return false; }
    },
    clear(): void { storage?.removeItem(PREFERENCES_STORAGE_KEY); },
  };
}
