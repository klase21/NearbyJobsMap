import type Database from "better-sqlite3";
import type { UpsertAction } from "../../../db/repositories/job-repository";
import type { JobKoreaListingClassificationMetadata, JobKoreaListingPageResult, JobKoreaSearchExecution } from "../transport/jobkorea-search-types";
import type { JobKoreaHttpClient } from "../transport/jobkorea-http-client";

export interface JobKoreaCollectionOptions {
  searchUrl: string;
  pages: 1 | 2 | 3;
  maxDetails: number;
  mode: "dry-run" | "write";
  confirm: true;
}

export interface JobKoreaCollectionCandidate {
  sourcePostingId: string;
  sourceUrl: string;
  pageNumber: number;
  sourcePosition: number;
  observedLinkCount: number;
  listingClassification: JobKoreaListingClassificationMetadata;
}

export type JobKoreaCollectedDetailStatus = "active" | "expired" | "closed" | "deleted" | "access_blocked" | "parse_failed" | "invalid_detail" | "transport_failed";

export interface JobKoreaCollectedDetailOutcome {
  sourcePostingId: string;
  status: JobKoreaCollectedDetailStatus;
  parserResult: "parsed" | "failed";
  databaseAction: UpsertAction | "not_stored";
  diagnosticCodes: string[];
  transport: "http" | "playwright";
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
