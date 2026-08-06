import type { JobKoreaCollectionProgress, JobKoreaCollectionResult } from "../../sources/jobkorea/collection/jobkorea-collection-types";
import type { AlbamonCollectionResult } from "../../sources/albamon/collection/albamon-collection-types";
import type { CollectionPreset } from "../../sources/collection/collection-presets";

export type CollectionControlMode = "dry_run" | "write";
export type CollectionRunStatus = JobKoreaCollectionProgress["status"] | "failed";

export interface CollectionControlConfig {
  presetId: CollectionPreset["id"];
  pages: number;
  maxDetails: number;
}

export type CollectionRunSnapshot = Omit<JobKoreaCollectionProgress, "status"> & {
  status: CollectionRunStatus;
  runId: string;
  mode: CollectionControlMode;
  presetId: CollectionPreset["id"];
  source: "jobkorea" | "albamon";
  presetLabel: string;
  maxDetailsRequested: number;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  result: JobKoreaCollectionResult | AlbamonCollectionResult | null;
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
  source: "jobkorea" | "albamon";
  attempted: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  durationMs: number | null;
  status: string;
}
