import type { ExclusionField } from "../../services/collection-exclusion";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";

export type ProfileComparisonPeriod = "7d" | "30d" | "all";
export type ProfileComparisonRevisionScope = "current" | "all";

export interface ProfileComparisonRequest {
  profileIds: string[];
  period: ProfileComparisonPeriod;
  revisionScope: ProfileComparisonRevisionScope;
}

export interface ProfileComparisonRunSummary {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  revision: number | null;
  configurationHash: string | null;
  selectedCandidates: number | null;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export interface ProfilePerformanceComparison {
  profileId: string;
  writeRuns: number;
  completedRuns: number;
  failedRuns: number;
  latestRunAt: string | null;
  latestRunStatus: string | null;
  selectedCandidates: number | null;
  candidatesBeforeExclusion: number | null;
  excludedCandidates: number | null;
  candidatesAfterExclusion: number | null;
  detailAttempts: number | null;
  successfulDetailParses: number | null;
  listingFallbacks: number | null;
  inserted: number;
  updated: number;
  unchanged: number;
  lowerCompletenessSkips: number;
  failedItems: number;
  totalDurationMs: number | null;
  averageDurationMs: number | null;
  averageSelectedCandidates: number | null;
  exclusionRate: number | null;
  failureRate: number | null;
  insertUpdateRate: number | null;
  validRecordYield: number | null;
  listingFallbackRate: number | null;
  revisionsRepresented: Array<{ revision: number; runs: number }>;
  latestRunRevision: number | null;
  currentRevisionUsed: boolean;
  historicalConfigurationHashesDiffer: boolean;
  recentRuns: ProfileComparisonRunSummary[];
}

export interface ProfileConfigurationDifference {
  field: string;
  label: string;
  same: boolean;
  values: Array<{ profileId: string; value: string }>;
}

export interface ProfileExclusionComparison {
  commonKeywords: string[];
  commonKeywordsTruncated: boolean;
  uniqueKeywords: Array<{ profileId: string; keywords: string[]; truncated: boolean }>;
  commonFields: ExclusionField[];
  uniqueFields: Array<{ profileId: string; fields: ExclusionField[] }>;
  profilesWithoutExclusions: string[];
}

export interface ProfilePairOverlap {
  profileAId: string;
  profileBId: string;
  applicable: boolean;
  source: "jobkorea" | "albamon" | null;
  profileAIdentities: number | null;
  profileBIdentities: number | null;
  sharedIdentities: number | null;
  uniqueToA: number | null;
  uniqueToB: number | null;
  overlapPercentage: number | null;
  jaccardSimilarity: number | null;
  sharedSampleIds: string[];
  uniqueSampleIdsA: string[];
  uniqueSampleIdsB: string[];
}

export interface ProfileOverlapComparison {
  pairs: ProfilePairOverlap[];
  sharedByAll: number | null;
  sharedByAllSampleIds: string[];
  uniqueByProfile: Array<{ profileId: string; count: number | null; sampleIds: string[] }>;
  crossSourceLimited: boolean;
}

export interface SavedProfileComparisonResult {
  generatedAt: string;
  period: ProfileComparisonPeriod;
  revisionScope: ProfileComparisonRevisionScope;
  profiles: SavedCollectionProfile[];
  configurationDifferences: ProfileConfigurationDifference[];
  differenceSummary: string[];
  exclusions: ProfileExclusionComparison;
  performance: ProfilePerformanceComparison[];
  overlap: ProfileOverlapComparison;
  legacyLimitations: string[];
}
