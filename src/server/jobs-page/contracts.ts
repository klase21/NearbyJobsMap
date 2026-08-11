import type { JobFilterState, SortOption, UiJobRecord } from "../../domain/ui-job";
import type { JobFreshness } from "../../services/job-freshness";
import type { JobUserState } from "../../services/job-user-state";

export const JOB_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_JOB_PAGE_SIZE = 50;
export const MAX_JOB_PAGE_SIZE = 100;

export type WorkspaceView = "all" | "favorite" | "apply_planned" | "applied" | "waiting" | "interview" | "archived" | "hidden";

export interface JobsPageRequest {
  page: number;
  pageSize: number;
  filters: JobFilterState;
  sort: SortOption;
  workspaceView: WorkspaceView;
  origin?: { latitude: number; longitude: number };
  applyPersonalExclusions?: boolean;
}

export interface JobsFacetSummary {
  total: number;
  sources: Record<string, number>;
  provenance: Record<string, number>;
  completeness: Record<string, number>;
  regions: Record<string, number>;
  mapEligible: number;
  cities: string[];
  districts: string[];
  categories: string[];
  employmentTypes: string[];
  experienceRequirements: string[];
  educationRequirements: string[];
}

export interface DuplicateJobGroup {
  representativeId: string;
  totalItems: number;
  hasUserState: boolean;
}

export interface DuplicateJobGroupDetails {
  representativeId: string;
  members: UiJobRecord[];
  userStates: JobUserState[];
  freshness: JobFreshness[];
}

export interface MonthlyDistanceRanking {
  jobId: string;
  monthlyComparable: number;
  distanceKm: number;
  combinedScore: number;
}

export interface JobsPageResult {
  items: UiJobRecord[];
  userStates: JobUserState[];
  freshness: JobFreshness[];
  duplicateGroups: DuplicateJobGroup[];
  monthlyDistanceRankings?: MonthlyDistanceRanking[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasPrevious: boolean; hasNext: boolean };
  summary: { total: number; filtered: number; exact: number; todayOrClosing: number; jobKorea: number; albamon: number; mapEligible: number };
  facets: JobsFacetSummary;
  diagnostics: Array<{ jobId: string | null; code: string; message: string }>;
  personalExclusions?: { applied: boolean; count: number };
}

export function validateJobsPageRequest(value: JobsPageRequest): JobsPageRequest {
  if (!Number.isInteger(value.page) || value.page < 1) throw new Error("INVALID_PAGE");
  if (!JOB_PAGE_SIZES.includes(value.pageSize as (typeof JOB_PAGE_SIZES)[number]) || value.pageSize > MAX_JOB_PAGE_SIZE) throw new Error("INVALID_PAGE_SIZE");
  if (value.sort === "monthly_distance" && (!value.origin || !Number.isFinite(value.origin.latitude) || !Number.isFinite(value.origin.longitude))) throw new Error("ORIGIN_REQUIRED");
  if (value.applyPersonalExclusions !== undefined && typeof value.applyPersonalExclusions !== "boolean") throw new Error("INVALID_PERSONAL_EXCLUSIONS");
  return value;
}
