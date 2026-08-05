import type { ParseDiagnostic } from "../../../domain/source-contract";
import type { JobKoreaDetailOutcome, JobKoreaPermissionStatus, JobKoreaRunStatus } from "./types";
import type { JobKoreaLifecycleDiagnostic } from "./jobkorea-lifecycle";

export type JobKoreaSearchTransportChoice = "auto" | "playwright" | "direct";
export type JobKoreaSelectedSearchTransport = Exclude<JobKoreaSearchTransportChoice, "auto">;
export type JobKoreaSearchPageClassification =
  | "valid_search_results"
  | "valid_empty_results"
  | "login_redirect"
  | "verification_page"
  | "captcha_page"
  | "access_denied"
  | "root_redirect"
  | "malformed_results"
  | "unexpected_page"
  | "timeout"
  | "direct_endpoint_unavailable"
  | "direct_endpoint_session_required";

export interface JobKoreaSearchOptions {
  searchUrl: string;
  pages: 1 | 2;
  maxDetails: 0 | 1 | 2 | 3;
  transport: JobKoreaSearchTransportChoice;
  confirm: true;
  dryRun: boolean;
  diagnostic: boolean;
}

export interface JobKoreaListingCandidate {
  sourcePostingId: string;
  sourceUrl: string;
  title: string;
  companyName: string;
  pageNumber: number;
  listingPosition: number;
  promoted: boolean;
}

export interface JobKoreaSnapshotDiagnostic {
  code: string;
  message: string;
}

export interface JobKoreaSnapshotOrdinaryCandidate {
  postingId: string;
  href: string;
  title: string;
  companyName: string;
  position: number;
  rowId: string | null;
  sourceSelector: string;
}

export interface JobKoreaSnapshotExcludedCandidate {
  postingId?: string | null;
  href: string | null;
  reason: string;
}

export interface JobKoreaPageSnapshot {
  schemaVersion: 1;
  finalUrl: string;
  pageTitle: string;
  readyState: string;
  extractionCompleted: boolean;
  evidence: {
    ordinaryContainerCount: number | null;
    ordinaryDetailLinkCount: number | null;
    allNumericDetailLinkCount: number | null;
    promotedContainerCount: number | null;
    promotedDetailLinkCount: number | null;
    rejectedDetailLinkCount: number | null;
    noResultMarkerCount: number | null;
    loginMarkerCount: number | null;
    captchaMarkerCount: number | null;
    verificationMarkerCount: number | null;
    accessDeniedMarkerCount: number | null;
  };
  ordinaryCandidates: JobKoreaSnapshotOrdinaryCandidate[];
  promotedCandidates: Array<JobKoreaSnapshotExcludedCandidate & { postingId: string | null }>;
  rejectedCandidates: JobKoreaSnapshotExcludedCandidate[];
  diagnostics: JobKoreaSnapshotDiagnostic[];
}

export interface JobKoreaListingPageResult {
  pageNumber: number;
  snapshotSchemaVersion: 1 | null;
  finalUrl: string | null;
  pageTitle: string | null;
  classification: JobKoreaSearchPageClassification;
  extractedCount: number | null;
  ordinaryPostingCount: number | null;
  promotedPostingCount: number | null;
  rejectedCandidateCount: number | null;
  duplicateWithinPageCount: number | null;
  uniqueNewCount: number | null;
  sourceReportsNoResults: boolean | null;
  validEmptyPage: boolean;
  blocked: boolean;
  parserFailure: boolean;
  diagnostics: ParseDiagnostic[];
  candidates: JobKoreaListingCandidate[];
}

export interface JobKoreaDirectContractObservation {
  endpoint: string;
  method: string;
  body: Record<string, string>;
  contentType: string | null;
  ordinaryResultSelector: "tr.devloopArea[data-gno]";
  hasCookieHeader: boolean;
  hasAuthorizationHeader: boolean;
  hasTokenField: boolean;
}

export interface JobKoreaDirectVerificationResult {
  classification: "available" | "direct_endpoint_unavailable" | "direct_endpoint_session_required";
  observation: JobKoreaDirectContractObservation | null;
  diagnostic: ParseDiagnostic;
}

export interface JobKoreaSearchExecution {
  transportUsed: JobKoreaSelectedSearchTransport;
  pages: JobKoreaListingPageResult[];
  consoleErrors: string[];
  directVerification: JobKoreaDirectVerificationResult;
  readonly searchNavigationCount: number;
  readonly detailNavigationCount: number;
  readonly directRequestCount: number;
  readonly lifecycleDiagnostics: JobKoreaLifecycleDiagnostic[];
  close(): Promise<void>;
  fetchDetail(url: string): Promise<{ finalUrl: string; html: string; explicitClosed: boolean }>;
}

export interface JobKoreaSearchOneShotResult {
  runId: string | null;
  status: JobKoreaRunStatus;
  permissionStatus: JobKoreaPermissionStatus;
  dryRun: boolean;
  transportRequested: JobKoreaSearchTransportChoice;
  transportUsed: JobKoreaSelectedSearchTransport;
  robotsRequests: number;
  searchNavigations: number;
  detailNavigations: number;
  directRequests: number;
  pageResults: JobKoreaListingPageResult[];
  selectedCandidates: number;
  globalDuplicateCount: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  blocked: number;
  details: JobKoreaDetailOutcome[];
  consoleErrors: string[];
  directVerification: JobKoreaDirectVerificationResult;
  lifecycleDiagnostics: JobKoreaLifecycleDiagnostic[];
  elapsedMs: number;
  internalBudgetMs: number;
}
