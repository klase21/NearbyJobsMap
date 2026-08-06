import type Database from "better-sqlite3";
import type { UpsertAction } from "../../../db/repositories/job-repository";
import type { CollectionRegion, NormalizedRegion, RegionNormalizationConfidence } from "../../../services/region-normalizer";
import type { JobKoreaCollectionProgress } from "../../jobkorea/collection/jobkorea-collection-types";
import type { CollectionExclusionConfig, ExclusionSummary } from "../../../services/collection-exclusion";

export interface AlbamonListingCandidate {
  sourcePostingId: string;
  canonicalUrl: string;
  title: string;
  companyName: string;
  regionText: string | null;
  salaryText: string | null;
  employmentTypes: string[];
  workDaysText: string | null;
  workHoursText: string | null;
  postingDate: string | null;
  deadlineText: string | null;
  categoryLabels: string[];
  firstSourcePosition: number;
  observedLinkCount: number;
}

export interface AlbamonListingPageResult {
  pageNumber: number;
  requestedUrl: string;
  finalUrl: string | null;
  classification: "valid_results" | "valid_empty" | "login" | "verification" | "captcha" | "access_denied" | "malformed" | "transport_failed";
  extractedNumericLinkCount: number;
  uniquePostingIdCount: number;
  uniqueNewPostingIdCount: number;
  sourceReportsNoResults: boolean;
  blocked: boolean;
  parserFailure: boolean;
  validEmptyPage: boolean;
  candidates: AlbamonListingCandidate[];
  diagnosticCodes: string[];
}

export interface AlbamonCollectionOptions {
  presetId: string;
  presetLabel: string;
  pages: 1 | 2 | 3 | 4 | 5;
  maxDetails: number;
  mode: "dry-run" | "write";
  confirm: true;
  requestedRegions: CollectionRegion[];
  exclusion?: CollectionExclusionConfig;
  exclusionConfigHash?: string | null;
}

export interface AlbamonSelectedCandidate extends AlbamonListingCandidate {
  pageNumber: number;
  normalizedRegions: NormalizedRegion[];
  regionConfidence: RegionNormalizationConfidence;
}

export interface AlbamonCollectionResult extends ExclusionSummary {
  runId: string | null;
  mode: AlbamonCollectionOptions["mode"];
  status: "completed" | "partial" | "failed" | "blocked";
  source: "albamon";
  presetId: string;
  presetLabel: string;
  keyword: "오늘 등록";
  requestedRegions: CollectionRegion[];
  pageResults: AlbamonListingPageResult[];
  listingPagesRequested: number;
  listingPagesCompleted: number;
  numericLinksExtracted: number;
  uniquePostingIds: number;
  seoulMatches: number;
  gyeonggiMatches: number;
  multipleRegionMatches: number;
  unknownRegionCandidates: number;
  excludedByRegion: number;
  candidatesSelected: number;
  detailPagesAttempted: 0;
  successfullyParsed: 0;
  activeJobs: number;
  expiredOrClosedJobs: 0;
  transportFailures: number;
  blockedDetails: 0;
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
  details: [];
  elapsedMs: number;
}

export interface AlbamonCollectionDependencies {
  database: Database.Database;
  collectPages?: (pages: 1 | 2 | 3 | 4 | 5) => Promise<AlbamonListingPageResult[]>;
  now?: () => Date;
  onProgress?: (progress: JobKoreaCollectionProgress) => void;
}

export interface AlbamonCandidateSelection {
  candidates: AlbamonSelectedCandidate[];
  uniquePostingIds: number;
  seoulMatches: number;
  gyeonggiMatches: number;
  multipleRegionMatches: number;
  unknownRegionCandidates: number;
  excludedByRegion: number;
  exclusion: ExclusionSummary;
}

export type AlbamonCollectionCliOptions = AlbamonCollectionOptions;
export type AlbamonDatabaseAction = UpsertAction | "not_stored";
