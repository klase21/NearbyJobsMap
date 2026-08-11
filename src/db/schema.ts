import type { MapPosition } from "../domain/ui-job";
import type { CanonicalJob } from "../domain/canonical-job";
import type { JobSource } from "../domain/job-source";
import type { DataProvenanceKind, PermissionStatus } from "../domain/data-provenance";
import type { CollectionRegion, NormalizedRegion, RegionEvidenceSource, RegionNormalizationConfidence } from "../services/region-normalizer";
import type { ExclusionField } from "../services/collection-exclusion";

export const REQUIRED_MIGRATION_VERSION = "0015";

export type RecordKind = DataProvenanceKind;
export type EvidenceType = "observed_html" | "observed_json_ld" | "observed_internal_json" | "fictional_demo" | "public_page_observation";
export type IngestionType = "sanitized_fixture" | "fictional_demo_seed" | "jobkorea_one_shot_transport" | "albamon_listing_collection";
export type IngestionSource = "jobkorea" | "albamon" | "mixed" | "local_demo";
export type IngestionItemResult = "inserted" | "updated" | "unchanged" | "skipped" | "failed";

export interface IngestionMetadata {
  recordKind: RecordKind;
  evidenceType: EvidenceType;
  sourceFixtureReference: string;
  mapPosition: MapPosition | null;
  permissionStatus?: PermissionStatus;
  listingUrl?: string | null;
  detailUrl?: string | null;
  observedAt?: string | null;
  sanitizerVersion?: string | null;
  parserVersion?: string | null;
  observationKind?: "bounded_public_browser_observation" | "bounded_manual_collection" | "bounded_listing_collection" | null;
  observationTransport?: "playwright" | "direct" | null;
  pageNumber?: number | null;
  listingPosition?: number | null;
  collectionPresetId?: string | null;
  collectionPresetLabel?: string | null;
  collectionKeyword?: string | null;
  requestedRegions?: CollectionRegion[];
  normalizedRegions?: NormalizedRegion[];
  regionConfidence?: RegionNormalizationConfidence;
  regionEvidenceSource?: RegionEvidenceSource;
  sourceAreaCode?: string | null;
  displayedLocationPresent?: boolean | null;
  addressQuality?: import("../services/job-data-quality").AddressQuality;
  salaryQuality?: import("../services/job-data-quality").SalaryQuality;
  commuteReady?: boolean;
  detailAccessStatus?: "available" | "access_blocked" | "unavailable" | "not_attempted" | null;
  observedLinkCount?: number | null;
  postingDateEvidence?: string | null;
  postingDateStatus?: import("../services/collection-date").PostingDateStatus;
  postingDateLocalDate?: string | null;
}

export interface TransportRunMetadata {
  permissionStatus: Exclude<PermissionStatus, null>;
  listingUrl: string;
  maxDetails: number;
  contentRequestLimit: number;
  preflightRequestLimit: number;
  dryRun: boolean;
  selectedTransport?: "playwright" | "direct" | null;
  searchPageCount?: number;
  exclusionKeywords?: string[];
  exclusionFields?: ExclusionField[];
  exclusionConfigHash?: string | null;
  savedProfileId?: string | null;
  savedProfileName?: string | null;
  savedProfileRevision?: number | null;
  savedProfileConfigurationHash?: string | null;
  collectionDateScope?: "all" | "today";
  collectionTimezone?: "Asia/Seoul" | null;
  collectionLocalDate?: string | null;
  postingDateCounts?: { today: number; older: number; unknown: number; futureInvalid: number };
  sourceFailureCount?: number;
  operationKind?: "collection" | "manual_backfill";
  cutoffDate?: string | null;
  pagesScanned?: number;
  stopReason?: string | null;
  oldestPostingDate?: string | null;
  preWriteBackupFile?: string | null;
}

export interface TransportRunCompletion {
  preflightRequests: number;
  contentRequests: number;
  selectedDetailCount: number;
  blockedCount: number;
  browserNavigations?: number;
  detailNavigations?: number;
  directRequests?: number;
}

export interface IngestionRecord {
  job: CanonicalJob;
  metadata: IngestionMetadata;
}

export interface IngestionDiagnostic {
  source: JobSource;
  sourcePostingId: string | null;
  code: string;
  message: string;
}

export interface IngestionResult {
  runId: string;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  diagnostics: IngestionDiagnostic[];
}

export interface PersistedJobRecord extends IngestionRecord {
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryDiagnostic {
  jobId: string | null;
  code: string;
  message: string;
}

export interface RepositoryListResult {
  records: PersistedJobRecord[];
  diagnostics: RepositoryDiagnostic[];
}

export interface DatabaseStatus {
  path: string;
  appliedMigrations: string[];
  pendingMigrations: string[];
  totalJobs: number;
  fixtureDerived: number;
  fictional: number;
  oneShotObserved: number;
  jobKorea: number;
  albamon: number;
  withCoordinates: number;
  withoutCoordinates: number;
  latestRuns: Array<{
    id: string;
    ingestionType: IngestionType;
    status: string;
    startedAt: string;
    inserted: number;
    updated: number;
    unchanged: number;
    failed: number;
    permissionStatus: PermissionStatus;
  }>;
  latestOneShotRun: {
    id: string;
    status: string;
    startedAt: string;
    permissionStatus: PermissionStatus;
    selectedTransport: "playwright" | "direct" | null;
  } | null;
}
