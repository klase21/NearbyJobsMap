import type Database from "better-sqlite3";
import { DEMO_JOBS } from "../../data/demo-jobs";
import type { UiJobRecord } from "../../domain/ui-job";
import type { IngestionRecord, IngestionResult } from "../schema";
import { IngestionService } from "./ingestion-service";

export function getDemoSeedRecords(records: UiJobRecord[] = DEMO_JOBS): IngestionRecord[] {
  return records.map((record) => ({
    job: record.job,
    metadata: {
      recordKind: "fictional_demo",
      evidenceType: "fictional_demo",
      sourceFixtureReference: `src/data/demo-jobs.ts#${record.job.id}`,
      mapPosition: record.mapPosition,
    },
  }));
}

export function seedFictionalDemoJobs(database: Database.Database): IngestionResult {
  return new IngestionService(database).ingest(getDemoSeedRecords(), { source: "local_demo", ingestionType: "fictional_demo_seed" });
}
