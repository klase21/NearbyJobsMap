import type { JobKoreaCollectionProgress, JobKoreaCollectionResult } from "../../sources/jobkorea/collection/jobkorea-collection-types";
import type { AlbamonCollectionResult } from "../../sources/albamon/collection/albamon-collection-types";
import type { CollectionPreset } from "../../sources/collection/collection-presets";
import type { CollectionExclusionConfig } from "../../services/collection-exclusion";

export type CollectionControlMode = "dry_run" | "write";
export type CollectionRunStatus = JobKoreaCollectionProgress["status"] | "failed";

export interface CollectionControlConfig {
  presetId: CollectionPreset["id"];
  pages: number;
  maxDetails: number;
  exclusion: CollectionExclusionConfig;
  savedProfile?: { id: string; name: string; revision: number; configurationHash: string } | null;
}

export type CollectionRunSnapshot = Omit<JobKoreaCollectionProgress, "status"> & {
  status: CollectionRunStatus;
  runId: string;
  mode: CollectionControlMode;
  presetId: CollectionPreset["id"];
  source: "jobkorea" | "albamon";
  presetLabel: string;
  maxDetailsRequested: number;
  exclusion: CollectionExclusionConfig;
  exclusionConfigHash: string;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  result: JobKoreaCollectionResult | AlbamonCollectionResult | null;
  error: { code: string; message: string } | null;
  writeAuthorizationToken: string | null;
  writeAuthorizationExpiresAt: string | null;
  savedProfile: CollectionControlConfig["savedProfile"];
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
  savedProfile: { id: string; name: string; revision: number; configurationHash: string; deleted: boolean } | null;
}
