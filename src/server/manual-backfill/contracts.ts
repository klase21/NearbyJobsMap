import type { CollectionExclusionConfig } from "../../services/collection-exclusion";

export type ManualBackfillSource = "albamon" | "jobkorea";
export type ManualBackfillScope = "albamon_personal_all" | "date_cutoff";
export type ManualBackfillMode = "dry_run" | "write";
export type ManualBackfillStatus = "preparing" | "running" | "completed" | "failed" | "cancelled";

export interface ManualBackfillConfig {
  source: ManualBackfillSource;
  scope: ManualBackfillScope;
  cutoffDate: string | null;
  maxPages: number;
  exclusion: CollectionExclusionConfig;
  personalProfileHash: string | null;
}

export interface ManualBackfillResult {
  pages: number;
  records: number;
  selected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  duplicates: number;
  sourceTotal: number | null;
  candidatesExcluded: number;
  monthlyRecords: number;
  hourlyRecords: number;
  dailyRecords: number;
  salaryRecords: number;
  coordinateRecords: number;
  parserErrors: number;
  fullExhausted: boolean;
  oldestPostingDate: string | null;
  stopReason: string;
  runId: string | null;
  preWriteBackupFile: string | null;
  dryRunCandidateCount: number | null;
  writeCandidateCount: number | null;
  candidateDelta: number | null;
  newSinceDryRun: number | null;
}

export interface ManualBackfillSnapshot extends ManualBackfillConfig {
  id: string;
  mode: ManualBackfillMode;
  status: ManualBackfillStatus;
  currentPage: number;
  recordsSeen: number;
  uniqueRecords: number;
  oldestPostingDate: string | null;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  result: ManualBackfillResult | null;
  error: { code: string; message: string } | null;
  writeAuthorizationToken: string | null;
  writeAuthorizationExpiresAt: string | null;
}

export interface RecentManualBackfill {
  id: string;
  source: ManualBackfillSource;
  startedAt: string;
  completedAt: string | null;
  cutoffDate: string | null;
  pages: number;
  records: number;
  inserted: number;
  updated: number;
  unchanged: number;
  stopReason: string | null;
  status: string;
}
