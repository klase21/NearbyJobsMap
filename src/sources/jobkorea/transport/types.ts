import type { UpsertAction } from "../../../db/repositories/job-repository";

export type JobKoreaPageKind = "robots" | "listing" | "detail";
export type JobKoreaPermissionStatus = "unverified" | "blocked";
export type JobKoreaRunStatus = "completed" | "partial" | "failed" | "blocked";

export interface JobKoreaTransportOptions {
  listingUrl: string;
  maxDetails: 1 | 2 | 3;
  confirm: true;
  dryRun: boolean;
}

export interface JobKoreaTransportDiagnostic {
  code: string;
  message: string;
  sourcePostingId: string | null;
  url: string | null;
}

export interface JobKoreaDetailOutcome {
  sourcePostingId: string | null;
  url: string;
  result: UpsertAction | "rejected" | "blocked" | "failed";
  diagnosticCodes: string[];
  contentHash: string | null;
}

export interface JobKoreaOneShotResult {
  runId: string | null;
  status: JobKoreaRunStatus;
  permissionStatus: JobKoreaPermissionStatus;
  dryRun: boolean;
  preflightRequests: number;
  contentRequests: number;
  listingRequests: number;
  detailRequests: number;
  listingCandidates: number;
  rejectedCandidates: number;
  selectedCandidates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  blocked: number;
  diagnostics: JobKoreaTransportDiagnostic[];
  details: JobKoreaDetailOutcome[];
}

export interface JobKoreaHttpResponse {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirectCount: number;
}

export type JobKoreaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
