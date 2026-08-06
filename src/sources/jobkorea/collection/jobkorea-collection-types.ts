import type Database from "better-sqlite3";
import type { UpsertAction } from "../../../db/repositories/job-repository";
import type { JobKoreaListingCardFields, JobKoreaListingClassificationMetadata, JobKoreaListingPageResult, JobKoreaSearchExecution } from "../transport/jobkorea-search-types";
import type { JobKoreaHttpClient } from "../transport/jobkorea-http-client";
import type { CollectionRegion, NormalizedRegion, RegionNormalizationConfidence } from "../../../services/region-normalizer";
import type { CollectionExclusionConfig, ExclusionSummary } from "../../../services/collection-exclusion";

export interface JobKoreaCollectionOptions {
  searchUrl: string;
  pages: 1 | 2 | 3 | 4 | 5;
  maxDetails: number;
  mode: "dry-run" | "write";
  confirm: true;
  allowListingFallback?: boolean;
  presetId?: string | null;
  presetLabel?: string | null;
  keyword?: string;
  requestedRegions?: CollectionRegion[];
  exclusion?: CollectionExclusionConfig;
  exclusionConfigHash?: string | null;
  savedProfile?: { id: string; name: string; revision: number; configurationHash: string } | null;
}

export interface JobKoreaCollectionCandidate {
  sourcePostingId: string;
  sourceUrl: string;
  pageNumber: number;
  sourcePosition: number;
  observedLinkCount: number;
  listingClassification: JobKoreaListingClassificationMetadata;
  listingFields: JobKoreaListingCardFields | null;
  normalizedRegions: NormalizedRegion[];
  regionConfidence: RegionNormalizationConfidence;
}

export type JobKoreaCollectedDetailStatus = "active" | "expired" | "closed" | "deleted" | "access_blocked" | "parse_failed" | "invalid_detail" | "transport_failed";

export interface JobKoreaCollectedDetailOutcome {
  sourcePostingId: string;
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectCount: number | null;
  redirectClassification: "none" | "valid_detail_redirect" | "mobile_desktop_canonical_redirect" | "login_redirect" | "root_redirect" | "malformed_redirect" | "access_denied" | "not_observed";
  redirectChain: Array<{ status: number; host: string; path: string }>;
  status: JobKoreaCollectedDetailStatus;
  parserResult: "parsed" | "failed";
  canonicalValidation: "passed" | "failed" | "not_reached";
  databaseAction: UpsertAction | "not_stored";
  diagnosticCodes: string[];
  transport: "http" | "playwright";
  dataCompleteness: "detail_complete" | "listing_only" | "none";
}

export interface JobKoreaCollectionResult extends ExclusionSummary {
  runId: string | null;
  mode: JobKoreaCollectionOptions["mode"];
  status: "completed" | "partial" | "failed" | "blocked";
  presetId: string | null;
  presetLabel: string | null;
  keyword: string;
  requestedRegions: CollectionRegion[];
  pageResults: JobKoreaListingPageResult[];
  listingPagesRequested: number;
  listingPagesCompleted: number;
  numericLinksExtracted: number;
  uniquePostingIds: number;
  seoulMatches: number;
  gyeonggiMatches: number;
  multipleRegionMatches: number;
  unknownRegionCandidates: number;
  excludedByRegion: number;
  excludedRegionSamples: Array<{ sourcePostingId: string; reason: "nonmatching" | "unknown"; normalizedRegions: NormalizedRegion[] }>;
  candidatesSelected: number;
  detailPagesAttempted: number;
  successfullyParsed: number;
  activeJobs: number;
  expiredOrClosedJobs: number;
  transportFailures: number;
  blockedDetails: number;
  parseFailures: number;
  predictedInserts: number;
  predictedUpdates: number;
  predictedUnchanged: number;
  actualInserts: number;
  actualUpdates: number;
  actualUnchanged: number;
  listingOnlyRecords: number;
  failedRecords: number;
  predictedLowerCompletenessSkips: number;
  actualLowerCompletenessSkips: number;
  totalSqliteJobs: number;
  details: JobKoreaCollectedDetailOutcome[];
  elapsedMs: number;
}

export interface JobKoreaCollectionDependencies {
  database: Database.Database;
  createExecution?: (options: import("../transport/jobkorea-search-types").JobKoreaSearchOptions) => Promise<JobKoreaSearchExecution>;
  httpClient?: JobKoreaHttpClient;
  now?: () => Date;
  onProgress?: (progress: JobKoreaCollectionProgress) => void;
}

export type JobKoreaCollectionProgressStatus =
  | "preparing"
  | "collecting_listings"
  | "filtering_regions"
  | "collecting_details"
  | "applying_listing_fallback"
  | "predicting_changes"
  | "writing_database"
  | "completed";

export interface JobKoreaCollectionProgress {
  status: JobKoreaCollectionProgressStatus;
  message: string;
  listingPagesRequested: number;
  listingPagesCompleted: number;
  numericLinksExtracted: number;
  uniquePostingIds: number;
  regionMatchingCandidates: number;
  candidatesBeforeExclusion?: number;
  candidatesExcluded?: number;
  candidatesAfterExclusion?: number;
  selectedCandidates: number;
  detailAttemptsCompleted: number;
  detailAttemptsTotal: number;
  successfulDetailParses: number;
  listingFallbacks: number;
  failedRecords: number;
  predictedInserts: number;
  predictedUpdates: number;
  predictedUnchanged: number;
  actualInserts: number;
  actualUpdates: number;
  actualUnchanged: number;
  lowerCompletenessSkips: number;
}
