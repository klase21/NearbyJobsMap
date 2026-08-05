import type { CanonicalJob } from "./canonical-job";
import type { LocationAccuracy } from "./location";
import type { PostingStatus } from "./posting-status";
import type { SalaryType } from "./salary";

export type ActiveJobSource = "jobkorea" | "albamon";
export type RegionGroup = "서울" | "경기";
export type UserJobStatus = "reviewing" | "saved" | "planned" | "applied" | "excluded";
export type SortOption = "newest" | "deadline" | "distance" | "hourly" | "daily" | "monthly" | "annual" | "normalized_monthly" | "company";

export interface UserOrigin { name: string; latitude: number; longitude: number; example: boolean }
export interface MapPosition { latitude: number; longitude: number; kind: "exact" | "estimated"; provenance: "source" | "fictional_demo" }

export interface UiJobRecord {
  job: CanonicalJob;
  isFictional: boolean;
  safeSourceUrl: string | null;
  mapPosition: MapPosition | null;
}

export interface SalaryThresholds { hourly: number; daily: number; monthly: number; annual: number; normalizedMonthly: number }

export interface JobFilterState {
  keyword: string;
  source: "all" | ActiveJobSource;
  region: "all" | RegionGroup;
  city: string;
  district: string;
  category: string;
  employmentType: string;
  experienceRequirement: string;
  educationRequirement: string;
  salaryType: "all" | SalaryType;
  salaryThresholds: SalaryThresholds;
  postingStatus: "all" | PostingStatus;
  locationAccuracy: "all" | LocationAccuracy;
  locationMode: "all" | "exact" | "estimated";
  deadline: "all" | "within_3_days" | "within_7_days" | "no_deadline";
  showDemo: boolean;
}

export interface SavedPreferences {
  filters: JobFilterState;
  sort: SortOption;
  mapVisible: boolean;
  origin: UserOrigin;
  userJobStatuses: Record<string, UserJobStatus>;
}
