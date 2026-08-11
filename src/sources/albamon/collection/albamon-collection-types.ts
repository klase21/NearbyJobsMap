import type Database from "better-sqlite3";
import type { UpsertAction } from "../../../db/repositories/job-repository";
import type { CollectionRegion, NormalizedRegion, RegionEvidenceSource, RegionNormalizationConfidence } from "../../../services/region-normalizer";
import type { JobKoreaCollectionProgress } from "../../jobkorea/collection/jobkorea-collection-types";
import type { CollectionExclusionConfig, ExclusionSummary } from "../../../services/collection-exclusion";
import type { AlbamonAreaFilter } from "./albamon-region-evidence";
import type { SourcePostingDateEvidence } from "../../../services/collection-date";

export interface AlbamonListingCandidate {
  sourcePostingId: string;
  canonicalUrl: string;
  title: string;
  companyName: string;
  regionText: string | null;
  workplaceAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  salaryText: string | null;
  salaryFromStructured?: boolean;
  payType?: "hourly" | "daily" | "monthly" | "annual" | null;
  payTheDay?: boolean;
  salaryCandidateRejected?: boolean;
  employmentTypes: string[];
  workPeriodText?: string | null;
  workDaysText: string | null;
  workHoursText: string | null;
  postingDate: string | null;
  postingDateEvidence?: SourcePostingDateEvidence | null;
  deadlineText: string | null;
  categoryLabels: string[];
  firstSourcePosition: number;
  observedLinkCount: number;
  locationContaminationRejected?: boolean;
  regionConflict?: boolean;
}

export interface AlbamonListingPageResult {
  pageNumber: number;
  observedAt?: string;
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
  invalidCardCount?: number;
  sourceTotalCount?: number | null;
  sourceFilterRegion?: CollectionRegion | null;
  sourceFilterRegions?: CollectionRegion[];
  sourceAreaCode?: AlbamonAreaFilter | null;
  candidates: AlbamonListingCandidate[];
  diagnosticCodes: string[];
  transportDiagnostic?: AlbamonTransportDiagnostic;
}

export interface AlbamonTransportDiagnostic {
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectChain: Array<{ host: string; path: string; status: number | null }>;
  navigationElapsedMs: number | null;
  browserLaunchStatus: "completed" | "failed";
  contextCreationStatus: "completed" | "failed" | "not_attempted";
  pageCreationStatus: "completed" | "failed" | "not_attempted";
  errorName: string | null;
  errorMessage: string | null;
  failureCategory: string | null;
  dnsFailure: boolean;
  tlsFailure: boolean;
  timeoutFailure: boolean;
  pageCrash: boolean;
  pageCleanup: "completed" | "failed" | "not_attempted";
  contextCleanup: "completed" | "failed" | "not_attempted";
  browserCleanup: "completed" | "failed" | "not_attempted";
  serverCleanup: "completed" | "failed" | "not_attempted";
}

export interface AlbamonCollectionOptions {
  presetId: string;
  presetLabel: string;
  pages: number;
  maxDetails: number;
  mode: "dry-run" | "write";
  confirm: true;
  requestedRegions: CollectionRegion[];
  exclusion?: CollectionExclusionConfig;
  exclusionConfigHash?: string | null;
  savedProfile?: { id: string; name: string; revision: number; configurationHash: string } | null;
  diagnostic?: boolean;
  localTodayMode?: boolean;
  collectionDate?: { timezone: "Asia/Seoul"; resolvedDate: string };
  backfillCutoffDate?: string;
  personalProfileBackfill?: boolean;
  historicalSortType?: "POSTED_DATE" | "MONTHLY_SALARY";
  signal?: AbortSignal;
}

export interface AlbamonSelectedCandidate extends AlbamonListingCandidate {
  pageNumber: number;
  normalizedRegions: NormalizedRegion[];
  regionConfidence: RegionNormalizationConfidence;
  regionEvidenceSource: RegionEvidenceSource;
  sourceAreaCode: AlbamonAreaFilter | null;
}

export interface AlbamonCollectionResult extends ExclusionSummary {
  runId: string | null;
  mode: AlbamonCollectionOptions["mode"];
  status: "completed" | "partial" | "failed" | "blocked";
  source: "albamon";
  presetId: string;
  presetLabel: string;
  keyword: string;
  requestedRegions: CollectionRegion[];
  pageResults: AlbamonListingPageResult[];
  listingPagesRequested: number;
  listingPagesCompleted: number;
  numericLinksExtracted: number;
  uniquePostingIds: number;
  observedUniquePostingIds?: number;
  validListingCards: number;
  invalidListingCards: number;
  seoulMatches: number;
  gyeonggiMatches: number;
  multipleRegionMatches: number;
  capitalScopeMatches: number;
  unknownRegionCandidates: number;
  excludedByRegion: number;
  displayedLocationRecords: number;
  sourceFilterOnlyRecords: number;
  regionConflicts: number;
  titleLocationContaminationRejections: number;
  workplaceAddressRecords: number;
  coordinatesAccepted: number;
  coordinatesSuppressedDueConflict: number;
  salaryDisplayPresent: number;
  salaryDisplayMissing: number;
  monthlyStructuredSalary: number;
  hourlyStructuredSalary: number;
  dailyStructuredSalary: number;
  validUnstructuredSalary: number;
  rejectedSalaryCandidates: number;
  payTheDayRecords: number;
  payTheDaySalaryRecords: number;
  scheduleRecords: number;
  todayPostingDateContradictions: number;
  deadlineRecords: number;
  employmentTypeRecords: number;
  metadataExamples?: Array<{
    sourcePostingId: string;
    regionText: string | null;
    workplaceAddress: string | null;
    normalizedRegions: NormalizedRegion[];
    regionConflict: boolean;
    salaryText: string | null;
    payType: "hourly" | "daily" | "monthly" | "annual" | null;
    payTheDay: boolean;
    coordinatesPresent: boolean;
    workPeriodText: string | null;
    workDaysText: string | null;
    workHoursText: string | null;
    postingDate: string | null;
    deadlineText: string | null;
  }>;
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
  postingDateCounts?: { today: number; older: number; unknown: number; futureInvalid: number };
  postingDateEvidenceExamples?: string[];
  sourceFilterTodayEligible?: number;
  registeredMetadataRecords?: number;
  sourceTotalCount?: number | null;
}

export interface AlbamonCollectionDependencies {
  database: Database.Database;
  collectPages?: (pages: number, options?: { sourceFilterRegions?: CollectionRegion[]; localTodayMode?: boolean; historicalMode?: boolean; historicalSortType?: "POSTED_DATE" | "MONTHLY_SALARY"; cutoffDate?: string; exclusionKeywords?: string[]; signal?: AbortSignal; onPage?: (page: AlbamonListingPageResult) => void }) => Promise<AlbamonListingPageResult[]>;
  now?: () => Date;
  onProgress?: (progress: JobKoreaCollectionProgress) => void;
  onPage?: (page: AlbamonListingPageResult) => void;
}

export interface AlbamonCandidateSelection {
  candidates: AlbamonSelectedCandidate[];
  uniquePostingIds: number;
  seoulMatches: number;
  gyeonggiMatches: number;
  multipleRegionMatches: number;
  capitalScopeMatches: number;
  unknownRegionCandidates: number;
  excludedByRegion: number;
  displayedLocationRecords: number;
  sourceFilterOnlyRecords: number;
  regionConflicts: number;
  titleLocationContaminationRejections: number;
  exclusion: ExclusionSummary;
}

export type AlbamonCollectionCliOptions = AlbamonCollectionOptions;
export type AlbamonDatabaseAction = UpsertAction | "not_stored";
