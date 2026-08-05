import { DatabaseAccessError, openReadonlyDatabase } from "../connection";
import { listAppliedMigrations } from "../migrate";
import { JobRepository } from "../repositories/job-repository";
import { REQUIRED_MIGRATION_VERSION } from "../schema";
import type { UiJobRecord } from "../../domain/ui-job";

export interface UiDataLoadResult {
  jobs: UiJobRecord[];
  diagnostics: Array<{ jobId: string | null; code: string; message: string }>;
}

export function loadUiJobsFromDatabase(path?: string): UiDataLoadResult {
  const database = openReadonlyDatabase(path);
  try {
    const applied = listAppliedMigrations(database);
    if (!applied.includes(REQUIRED_MIGRATION_VERSION)) {
      throw new DatabaseAccessError("DATABASE_NOT_READY", `필수 migration ${REQUIRED_MIGRATION_VERSION}이 적용되지 않았습니다.`);
    }
    const result = new JobRepository(database).listUiRecords();
    return { jobs: result.records, diagnostics: result.diagnostics };
  } finally {
    database.close();
  }
}
