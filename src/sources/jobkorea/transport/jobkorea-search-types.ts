import type { ParseDiagnostic } from "../../../domain/source-contract";
import type { JobKoreaDetailOutcome, JobKoreaPermissionStatus, JobKoreaRunStatus } from "./types";
import type { JobKoreaLifecycleDiagnostic } from "./jobkorea-lifecycle";

export type JobKoreaSearchTransportChoice = "auto" | "playwright" | "direct";
export type JobKoreaSelectedSearchTransport = Exclude<JobKoreaSearchTransportChoice, "auto">;
export type JobKoreaSearchPageClassification =
  | "valid_search_results" | "valid_empty_results" | "login_redirect" | "verification_page"
  | "captcha_page" | "access_denied" | "root_redirect" | "malformed_results"
  | "unexpected_page" | "timeout" | "direct_endpoint_unavailable" | "direct_endpoint_session_required";

export interface JobKoreaSearchOptions {
  searchUrl: string;
  pages: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  pageNumbers?: number[];
  maxDetails: number;
  transport: JobKoreaSearchTransportChoice;
  confirm: true;
  dryRun: boolean;
  diagnostic: boolean;
}

export type JobKoreaListingClassificationMetadata =
  | "verified_ordinary" | "explicit_promoted" | "recommendation" | "recent_view"
  | "structurally_provisional" | "unclassified_result_link";

export interface JobKoreaCollectionCandidate {
  postingId: string;
  canonicalUrl: string;
  firstSourcePosition: number;
  observedLinkCount: number;
  listingClassification: JobKoreaListingClassificationMetadata;
  listingFields?: JobKoreaListingCardFields | null;
}

export interface JobKoreaListingCardFields {
  title: string | null;
  companyName: string | null;
  regionText: string | null;
  salaryText: string | null;
  employmentTypes: string[];
  experienceRequirement: string | null;
  educationRequirement: string | null;
  postedAt: string | null;
  deadlineText: string | null;
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

export type JobKoreaRejectionReason =
  | "NO_ORDINARY_ANCESTOR" | "INSIDE_RECOMMENDATION_REGION" | "INSIDE_RECENT_VIEW_REGION"
  | "INSIDE_UNRELATED_WIDGET" | "INVALID_POSTING_ID" | "INVALID_DETAIL_PATH" | "DISALLOWED_HOST"
  | "TRACKING_REDIRECT" | "OUTSIDE_RESULT_ROOT" | "ANCESTOR_SIGNATURE_UNRECOGNIZED"
  | "DETACHED_DURING_EXTRACTION" | "SVG_ANCHOR_UNSUPPORTED" | "UNKNOWN_REJECTION";

export type JobKoreaCandidateClassification = "ordinary" | "promoted" | "rejected";
export type JobKoreaPromotionSignal = "exact_class_token" | "data_attribute" | "semantic_label";
export type JobKoreaDocumentReadyState = "loading" | "interactive" | "complete" | "unknown";
export type JobKoreaReadinessReason = "numeric_detail_link" | "ordinary_container" | "no_result" | "login"
  | "captcha" | "verification" | "access_denied" | "unknown";
export type JobKoreaResourceType = "document" | "script" | "xhr" | "fetch" | "stylesheet" | "image" | "font" | "media" | "other";

export interface JobKoreaSnapshotDiagnostic { code: string; message: string }

export interface JobKoreaElementSignature {
  tag: string;
  id: string | null;
  classes: string[];
  role: string | null;
  dataAttributes: Record<string, string>;
  ariaLabelPresent: boolean;
  depthFromAnchor: number;
  childElementCount: number;
  numericDetailLinkCount: number;
  hasKnownOrdinaryMarker: boolean;
  hasPromotedMarker: boolean;
  hasRecommendationMarker: boolean;
  hasRecentViewMarker: boolean;
}

export interface JobKoreaCandidateDiagnosticSample {
  postingId: string | null;
  href: string | null;
  classification: JobKoreaCandidateClassification;
  primaryReason: JobKoreaRejectionReason | "INSIDE_PROMOTED_REGION" | null;
  promotionSignal: JobKoreaPromotionSignal | null;
  sourcePosition: number;
  anchor: JobKoreaElementSignature;
  ancestors: JobKoreaElementSignature[];
  insideKnownResultRoot: boolean;
  insideKnownOrdinaryRow: boolean;
  insidePromotedRegion: boolean;
  insideRecommendationRegion: boolean;
  insideRecentViewRegion: boolean;
  structureKind: "table" | "list" | "article" | "section" | "div" | "other";
}

export interface JobKoreaContainerSignatureSummary {
  signatureKey: string;
  count: number;
  candidateClassifications: { ordinary: number; promoted: number; rejected: number };
  samplePostingIds: string[];
  signature: JobKoreaElementSignature;
}

export type JobKoreaStructuralGroupRejectionReason =
  | "OUTSIDE_KNOWN_RESULT_ROOT" | "MULTIPLE_POSTING_IDS_IN_GROUP" | "GROUP_ANCESTOR_NOT_FOUND"
  | "GROUP_ANCESTOR_IS_PAGE_LEVEL" | "GROUP_CONTAINS_PROMOTED_EVIDENCE"
  | "GROUP_CONTAINS_RECOMMENDATION_EVIDENCE" | "GROUP_CONTAINS_RECENT_VIEW_EVIDENCE"
  | "GROUP_STRUCTURE_NOT_REPEATED" | "GROUP_DESCENDANT_LIMIT_EXCEEDED" | "DUPLICATE_GROUP";

export interface JobKoreaProvisionalPostingGroup {
  postingId: string;
  canonicalUrl: string;
  linkCount: number;
  sourcePositions: number[];
  groupAncestor: JobKoreaElementSignature | null;
  groupAncestorDepth: number | null;
  parentListSignature: JobKoreaElementSignature | null;
  siblingGroupCount: number | null;
  uniquePostingIdsInsideGroup: string[];
  allLinksSharePostingId: boolean;
  insideKnownResultRoot: boolean;
  explicitPromotionEvidence: boolean;
  explicitRecommendationEvidence: boolean;
  explicitRecentViewEvidence: boolean;
  repeatedSiblingStructure: boolean;
  structurallyEligible: boolean;
  verifiedOrdinary: boolean;
  rejectionReasons: JobKoreaStructuralGroupRejectionReason[];
  structuralSignatureKey: string | null;
  parentSignatureKey: string | null;
}

export interface JobKoreaStructuralGroupSignatureSummary {
  signatureKey: string;
  groupCount: number;
  eligibleGroupCount: number;
  rejectedGroupCount: number;
  linkCountDistribution: Record<string, number>;
  siblingGroupCountMaximum: number;
  samplePostingIds: string[];
  signature: JobKoreaElementSignature;
}

export interface JobKoreaRepeatedListParentSummary {
  signatureKey: string;
  parentCount: number;
  repeatedGroupCount: number;
  samplePostingIds: string[];
  signature: JobKoreaElementSignature;
}

export interface JobKoreaShadowStructureDiagnostics {
  provisionalPostingGroupCount: number;
  structurallyEligibleGroupCount: number;
  structurallyRejectedGroupCount: number;
  totalGroupedNumericLinkCount: number;
  ungroupedNumericLinkCount: number;
  provisionalPostingGroups: JobKoreaProvisionalPostingGroup[];
  structuralGroupRejectionReasonCounts: Partial<Record<JobKoreaStructuralGroupRejectionReason, number>>;
  structuralGroupSignatureSummaries: JobKoreaStructuralGroupSignatureSummary[];
  repeatedListParentSummaries: JobKoreaRepeatedListParentSummary[];
  provisionalUniquePostingIds: string[];
  provisionalGroupSamplesTruncated: boolean;
  structuralSummariesTruncated: boolean;
  verifiedOrdinaryAlsoStructurallyEligible: number;
  structurallyEligibleButUnverified: number;
  verifiedOrdinaryStructuralMismatch: number;
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
  postingId: string | null;
  href: string | null;
  reason: JobKoreaRejectionReason | "INSIDE_PROMOTED_REGION";
}

export interface JobKoreaReadinessEvidence {
  reason: JobKoreaReadinessReason;
  numericDetailLinkCount: number;
  ordinaryContainerCount: number;
}

export interface JobKoreaPageSnapshot {
  schemaVersion: 2;
  serializedSnapshotBytes: number;
  finalUrl: string;
  pageTitle: string;
  documentReadyState: JobKoreaDocumentReadyState;
  extractionCompleted: boolean;
  extractionDurationMs: number | null;
  readiness: JobKoreaReadinessEvidence | null;
  domChangedAfterReadiness: boolean | null;
  evidence: {
    ordinaryContainerCount: number | null;
    ordinaryRowCount: number | null;
    resultRootCount: number | null;
    knownTableResultCount: number | null;
    knownListResultCount: number | null;
    knownCardResultCount: number | null;
    numericLinksInsideKnownTableResults: number | null;
    numericLinksInsideKnownListResults: number | null;
    numericLinksInsideKnownCardResults: number | null;
    ordinaryDetailLinkCount: number | null;
    allNumericDetailLinkCount: number | null;
    promotedContainerCount: number | null;
    recommendationContainerCount: number | null;
    recentViewContainerCount: number | null;
    promotedDetailLinkCount: number | null;
    rejectedDetailLinkCount: number | null;
    numericLinksInsideKnownResultRoots: number | null;
    numericLinksOutsideKnownResultRoots: number | null;
    noResultMarkerCount: number | null;
    loginMarkerCount: number | null;
    captchaMarkerCount: number | null;
    verificationMarkerCount: number | null;
    accessDeniedMarkerCount: number | null;
  };
  rejectionReasonCounts: Partial<Record<JobKoreaRejectionReason, number>>;
  promotionSignalCounts: Partial<Record<JobKoreaPromotionSignal, number>>;
  ordinaryCandidates: JobKoreaSnapshotOrdinaryCandidate[];
  promotedCandidates: JobKoreaSnapshotExcludedCandidate[];
  rejectedCandidates: JobKoreaSnapshotExcludedCandidate[];
  diagnosticSamples: {
    ordinary: JobKoreaCandidateDiagnosticSample[];
    promoted: JobKoreaCandidateDiagnosticSample[];
    rejected: JobKoreaCandidateDiagnosticSample[];
    ordinaryTruncated: boolean;
    promotedTruncated: boolean;
    rejectedTruncated: boolean;
  };
  containerSignatures: JobKoreaContainerSignatureSummary[];
  containerSignaturesTruncated: boolean;
  shadowStructure: JobKoreaShadowStructureDiagnostics;
  collectionCandidates: JobKoreaCollectionCandidate[];
  diagnostics: JobKoreaSnapshotDiagnostic[];
}

export interface JobKoreaFailedResourceSample {
  resourceType: JobKoreaResourceType;
  hostCategory: "jobkorea" | "third_party" | "invalid";
  failureCode: string;
  navigationCritical: boolean;
}

export interface JobKoreaFailedResourceSummary {
  totalCount: number;
  typeCounts: Partial<Record<JobKoreaResourceType, number>>;
  samples: JobKoreaFailedResourceSample[];
  samplesTruncated: boolean;
  preventedReadinessOrExtraction: boolean | null;
}

export interface JobKoreaListingPageResult {
  pageNumber: number;
  snapshotSchemaVersion: 2 | null;
  serializedSnapshotBytes: number | null;
  finalUrl: string | null;
  pageTitle: string | null;
  documentReadyState: JobKoreaDocumentReadyState | null;
  readinessReason: JobKoreaReadinessReason | null;
  readinessNumericDetailLinkCount: number | null;
  readinessOrdinaryContainerCount: number | null;
  domChangedAfterReadiness: boolean | null;
  classificationDurationMs: number | null;
  extractionDurationMs: number | null;
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
  evidence: JobKoreaPageSnapshot["evidence"] | null;
  rejectionReasonCounts: JobKoreaPageSnapshot["rejectionReasonCounts"] | null;
  promotionSignalCounts: JobKoreaPageSnapshot["promotionSignalCounts"] | null;
  diagnosticSamples: JobKoreaPageSnapshot["diagnosticSamples"] | null;
  containerSignatures: JobKoreaContainerSignatureSummary[] | null;
  containerSignaturesTruncated: boolean | null;
  shadowStructure: JobKoreaShadowStructureDiagnostics | null;
  collectionCandidates: JobKoreaCollectionCandidate[] | null;
  diagnostics: ParseDiagnostic[];
  candidates: JobKoreaListingCandidate[];
}

export interface JobKoreaDirectContractObservation {
  endpoint: string; method: string; body: Record<string, string>; contentType: string | null;
  ordinaryResultSelector: "tr.devloopArea[data-gno]";
  hasCookieHeader: boolean; hasAuthorizationHeader: boolean; hasTokenField: boolean;
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
  failedResources: JobKoreaFailedResourceSummary;
  directVerification: JobKoreaDirectVerificationResult;
  readonly searchNavigationCount: number;
  readonly detailNavigationCount: number;
  readonly directRequestCount: number;
  readonly lifecycleDiagnostics: JobKoreaLifecycleDiagnostic[];
  close(): Promise<void>;
  fetchDetail(url: string): Promise<{ finalUrl: string; html: string; explicitClosed: boolean }>;
}

export interface JobKoreaSearchOneShotResult {
  runId: string | null; status: JobKoreaRunStatus; permissionStatus: JobKoreaPermissionStatus; dryRun: boolean;
  transportRequested: JobKoreaSearchTransportChoice; transportUsed: JobKoreaSelectedSearchTransport;
  robotsRequests: number; searchNavigations: number; detailNavigations: number; directRequests: number;
  pageResults: JobKoreaListingPageResult[]; selectedCandidates: number; globalDuplicateCount: number;
  inserted: number; updated: number; unchanged: number; skipped: number; failed: number; blocked: number;
  details: JobKoreaDetailOutcome[]; consoleErrors: string[]; failedResources: JobKoreaFailedResourceSummary;
  directVerification: JobKoreaDirectVerificationResult; lifecycleDiagnostics: JobKoreaLifecycleDiagnostic[];
  elapsedMs: number; internalBudgetMs: number;
}
