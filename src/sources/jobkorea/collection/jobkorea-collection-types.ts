import type Database from "better-sqlite3";
import type { UpsertAction } from "../../../db/repositories/job-repository";
import type { JobKoreaListingCardFields, JobKoreaListingClassificationMetadata, JobKoreaListingPageResult, JobKoreaSearchExecution } from "../transport/jobkorea-search-types";
import type { JobKoreaHttpClient } from "../transport/jobkorea-http-client";

export interface JobKoreaCollectionOptions {
  searchUrl: string;
  pages: 1 | 2 | 3;
  maxDetails: number;
  mode: "dry-run" | "write";
  confirm: true;
  allowListingFallback?: boolean;
}

export interface JobKoreaCollectionCandidate {
  sourcePostingId: string;
  sourceUrl: string;
  pageNumber: number;
  sourcePosition: number;
  observedLinkCount: number;
  listingClassification: JobKoreaListingClassificationMetadata;
  listingFields: JobKoreaListingCardFields | null;
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

export interface JobKoreaCollectionResult {
  runId: string | null;
  mode: JobKoreaCollectionOptions["mode"];
  status: "completed" | "partial" | "failed" | "blocked";
  pageResults: JobKoreaListingPageResult[];
  listingPagesRequested: number;
  listingPagesCompleted: number;
  numericLinksExtracted: number;
  uniquePostingIds: number;
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
}
