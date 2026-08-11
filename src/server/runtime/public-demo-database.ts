import "server-only";

import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { UiJobRecord } from "../../domain/ui-job";
import { DEMO_JOBS } from "../../data/demo-jobs";
import { getDemoSeedRecords } from "../../db/services/demo-seed-service";
import { IngestionService } from "../../db/services/ingestion-service";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../../db/connection";
import { applyMigrations, listAppliedMigrations } from "../../db/migrate";
import { getPublicDemoDatabasePath, isVercelPublicDemo } from "./public-demo";

const PUBLIC_DEMO_JOB_COUNT = 30;
let initializedPath: string | null = null;

export function createPublicDemoJobs(source: readonly UiJobRecord[] = DEMO_JOBS): UiJobRecord[] {
  if (!source.length) throw new Error("PUBLIC_DEMO_SOURCE_EMPTY");
  return Array.from({ length: PUBLIC_DEMO_JOB_COUNT }, (_, index) => {
    const record = structuredClone(source[index % source.length]!);
    const sequence = String(index + 1).padStart(3, "0");
    record.job.id = `demo:public-${sequence}`;
    record.job.sourcePostingId = `demo-public-${sequence}`;
    if (index >= source.length && index !== source.length && index !== source.length + 1) {
      record.job.title = `${record.job.title} · 데모 ${sequence}`;
    }
    return record;
  });
}

function isReady(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const db = openReadonlyDatabase(path);
    try {
      const row = db.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number };
      return Number(row.count) === PUBLIC_DEMO_JOB_COUNT && listAppliedMigrations(db).length > 0;
    } finally { db.close(); }
  } catch { return false; }
}

function removeDatabaseFiles(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) unlinkSync(candidate);
  }
}

export function ensurePublicDemoDatabase(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
  temporaryDirectory = tmpdir(),
  processId = process.pid,
): string {
  const path = getPublicDemoDatabasePath(environment, temporaryDirectory, processId);
  if (initializedPath === path && isReady(path)) return path;
  if (!isReady(path)) {
    removeDatabaseFiles(path);
    const database = openWritableDatabase(path);
    try {
      applyMigrations(database);
      const records = getDemoSeedRecords(createPublicDemoJobs()).map((record, index) => ({
        ...record,
        metadata: {
          ...record.metadata,
          observationKind: index % 3 === 0 ? "bounded_manual_collection" as const
            : index % 3 === 1 ? "bounded_listing_collection" as const : null,
        },
      }));
      const result = new IngestionService(database).ingest(records, { source: "local_demo", ingestionType: "fictional_demo_seed" });
      if (result.inserted !== PUBLIC_DEMO_JOB_COUNT || result.failed !== 0) throw new Error("PUBLIC_DEMO_SEED_FAILED");
    } finally { database.close(); }
  }
  if (!isReady(path)) throw new Error("PUBLIC_DEMO_DATABASE_NOT_READY");
  initializedPath = path;
  return path;
}

export function getJobsDatabasePath(path?: string): string {
  if (path) return path;
  return isVercelPublicDemo() ? ensurePublicDemoDatabase() : getDatabasePath();
}
