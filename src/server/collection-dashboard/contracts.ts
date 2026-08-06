import type { ExclusionField } from "../../services/collection-exclusion";

export type DashboardPeriod = "7d" | "30d" | "all";
export type DashboardSource = "all" | "jobkorea" | "albamon";
export type DashboardRunStatus = "all" | "completed" | "failed";

export interface CollectionDashboardFilters {
  period: DashboardPeriod;
  source: DashboardSource;
  status: DashboardRunStatus;
}

export interface DashboardCountPair { total: number; manual: number }
export interface DashboardSourceOverview {
  source: "jobkorea" | "albamon";
  storedJobs: number;
  manuallyCollected: number;
  fixture: number;
  listingOnly: number;
  detailComplete: number;
  completenessUnknown: number;
  mapEligible: number;
  latestObservedAt: string | null;
  latestRun: { status: string; startedAt: string; presetLabel: string | null } | null;
}

export interface CollectionRunSummary {
  id: string;
  source: "jobkorea" | "albamon";
  presetId: string | null;
  presetLabel: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  selectedCandidates: number | null;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  excluded: number | null;
  durationMs: number | null;
  savedProfile?: { id: string; name: string; revision: number; configurationHash: string; deleted: boolean } | null;
}

export interface CollectionDashboardData {
  generatedAt: string;
  filters: CollectionDashboardFilters;
  inventory: {
    totalJobs: number;
    jobkoreaJobs: number;
    albamonJobs: number;
    fixtureRecords: number;
    fictionalRecords: number;
    manuallyCollectedRecords: number;
    listingOnlyRecords: number;
    detailCompleteRecords: number;
    completenessUnknownRecords: number;
    mapEligibleRecords: number;
    listOnlyRecords: number;
  };
  sources: DashboardSourceOverview[];
  regions: Record<"seoul" | "gyeonggi" | "multiple" | "other" | "unknown", DashboardCountPair>;
  completenessBySource: Array<{ source: "jobkorea" | "albamon"; listingOnly: number; detailComplete: number; unknown: number }>;
  mapCoverage: { eligible: number; listOnly: number; percentage: number | null; bySource: Array<{ source: "jobkorea" | "albamon"; eligible: number; total: number; percentage: number | null }> };
  effectiveness: {
    runs: number;
    selectedCandidates: number | null;
    detailAttempts: number | null;
    successfulDetailParses: number | null;
    listingFallbacks: number | null;
    inserted: number;
    updated: number;
    unchanged: number;
    lowerCompletenessSkips: number;
    failedItems: number;
    excludedCandidates: number | null;
    validRecordYield: number | null;
    insertUpdateYield: number | null;
    listingFallbackRate: number | null;
    failureRate: number | null;
  };
  exclusions: {
    runsUsingExclusions: number;
    candidatesBefore: number | null;
    candidatesExcluded: number | null;
    candidatesAfter: number | null;
    exclusionRate: number | null;
    topKeywords: Array<{ keyword: string; uses: number }>;
    fields: Array<{ field: ExclusionField; uses: number }>;
  };
  recentRuns: CollectionRunSummary[];
  profiles?: {
    total: number;
    jobkorea: number;
    albamon: number;
    favorites: number;
    usedLast30Days: number;
    mostRecentlyUsed: { id: string; name: string; source: "jobkorea" | "albamon"; lastUsedAt: string } | null;
    recent: Array<{ id: string; name: string; source: "jobkorea" | "albamon"; isFavorite: boolean; lastUsedAt: string | null }>;
  };
}

export interface CollectionRunDetail extends CollectionRunSummary {
  ingestionType: string;
  keyword: string | null;
  requestedRegions: string[] | null;
  pages: number | null;
  maxCandidates: number | null;
  exclusionKeywords: string[] | null;
  exclusionFields: ExclusionField[] | null;
  candidatesBeforeExclusion: number | null;
  detailAttempts: number | null;
  successfulDetailParses: number | null;
  listingFallbacks: number | null;
  permissionStatus: string | null;
  provenanceType: string | null;
  failureSummaries: Array<{ category: "access_blocked" | "verification" | "transport_failed" | "parse_failed" | "invalid_detail" | "other"; count: number }>;
}
