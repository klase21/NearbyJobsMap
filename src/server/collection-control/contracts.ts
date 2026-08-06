import type { JobKoreaCollectionProgress, JobKoreaCollectionResult } from "../../sources/jobkorea/collection/jobkorea-collection-types";
import type { JobKoreaCollectionPreset } from "../../sources/jobkorea/collection/jobkorea-collection-presets";

export type CollectionControlMode = "dry_run" | "write";
export type CollectionRunStatus = JobKoreaCollectionProgress["status"] | "failed";

export interface CollectionControlConfig {
  presetId: JobKoreaCollectionPreset["id"];
  pages: number;
  maxDetails: number;
}

export type CollectionRunSnapshot = Omit<JobKoreaCollectionProgress, "status"> & {
  status: CollectionRunStatus;
  runId: string;
  mode: CollectionControlMode;
  presetId: JobKoreaCollectionPreset["id"];
  presetLabel: string;
  maxDetailsRequested: number;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  result: JobKoreaCollectionResult | null;
  error: { code: string; message: string } | null;
  writeAuthorizationToken: string | null;
  writeAuthorizationExpiresAt: string | null;
};

export interface RecentCollectionRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  presetId: string | null;
  presetLabel: string;
  attempted: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  durationMs: number | null;
  status: string;
}
