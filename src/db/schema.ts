import type { MapPosition } from "../domain/ui-job";
import type { CanonicalJob } from "../domain/canonical-job";
import type { JobSource } from "../domain/job-source";

export const REQUIRED_MIGRATION_VERSION = "0001";

export type RecordKind = "fixture_derived" | "fictional_demo";
export type EvidenceType = "observed_html" | "observed_json_ld" | "observed_internal_json" | "fictional_demo";
export type IngestionType = "sanitized_fixture" | "fictional_demo_seed";
export type IngestionSource = "jobkorea" | "albamon" | "mixed" | "local_demo";
export type IngestionItemResult = "inserted" | "updated" | "unchanged" | "skipped" | "failed";

export interface IngestionMetadata {
  recordKind: RecordKind;
  evidenceType: EvidenceType;
  sourceFixtureReference: string;
  mapPosition: MapPosition | null;
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
  }>;
}
