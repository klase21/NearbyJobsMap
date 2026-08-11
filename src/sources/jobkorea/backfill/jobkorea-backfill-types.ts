import type { CollectionExclusionConfig } from "../../../services/collection-exclusion";
import type { CollectionRegion } from "../../../services/region-normalizer";
import type Database from "better-sqlite3";
import type { JobKoreaListingPageResult, JobKoreaSearchExecution } from "../transport/jobkorea-search-types";
import type { JobKoreaQualityAudit } from "./jobkorea-quality-audit";

export interface JobKoreaBackfillOptions {
  presetId: "capital-ai";
  presetLabel: string;
  keyword: string;
  searchUrl: string;
  pageFrom: number;
  pageTo: number;
  maxCandidates: number;
  listingOnly: true;
  mode: "dry-run" | "write";
  exclusion: CollectionExclusionConfig;
  localTodayMode?: boolean;
  collectionDate?: { timezone: "Asia/Seoul"; resolvedDate: string };
  backfillCutoffDate?: string;
  signal?: AbortSignal;
  onPage?: (page: JobKoreaListingPageResult) => void;
  requestedRegions?: CollectionRegion[];
}

export interface JobKoreaBackfillDependencies {
  database: Database.Database;
  createExecution?: (options: import("../transport/jobkorea-search-types").JobKoreaSearchOptions) => Promise<JobKoreaSearchExecution>;
  now?: () => Date;
  validateWrite?: (postingIds: string[]) => void;
}

export interface JobKoreaBackfillResult {
  mode: "dry-run" | "write";
  runId: string | null;
  status: "completed" | "partial" | "failed" | "blocked";
  pageResults: JobKoreaListingPageResult[];
  pagesRequested: number;
  pagesCompleted: number;
  parserFailurePages: number;
  unresolvedPageFailures: number;
  pageClassifications: Record<string, number>;
  linksExtracted: number;
  uniquePostingIds: number;
  crossPageDuplicates: number;
  validCards: number;
  invalidCards: number;
  seoulCandidates: number;
  gyeonggiCandidates: number;
  multipleRegionCandidates: number;
  unknownRegionCandidates: number;
  otherRegionCandidates: number;
  excludedByRegion: number;
  excludedByKeyword: number;
  locationContaminationRejected: number;
  selectedCandidates: number;
  predictedInserts: number;
  predictedUpdates: number;
  predictedUnchanged: number;
  predictedSkips: number;
  predictedObservations: number;
  predictedChangeEvents: number;
  salaryDisplayPresent: number;
  salaryDisplayMissing: number;
  annualStructuredSalary: number;
  monthlyStructuredSalary: number;
  otherStructuredSalary: number;
  validUnstructuredSalary: number;
  rejectedSalaryCandidates: number;
  salaryExamples: string[];
  actualInserts: number;
  actualUpdates: number;
  actualUnchanged: number;
  actualSkips: number;
  failedItems: number;
  observationsAdded: number;
  changeEventsAdded: number;
  qualityMetadataRepairs: number;
  qualityBefore: JobKoreaQualityAudit;
  qualityAfter: JobKoreaQualityAudit;
  detailRequests: number;
  browserDetailNavigations: number;
  retries: 0;
  elapsedMs: number;
  postingDateCounts?: { today: number; older: number; unknown: number; futureInvalid: number };
  postingDateEvidenceExamples?: string[];
  postingDateKinds?: { minuteRelative: number; hourRelative: number; dayRelative: number; absolute: number; midnightAmbiguous: number };
  stopReason?: import("../today/jobkorea-http-today").JobKoreaTodayStopReason;
  transportUsed: import("../transport/jobkorea-search-types").JobKoreaSelectedSearchTransport;
}
