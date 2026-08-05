import type Database from "better-sqlite3";
import { getDatabasePath } from "./connection";
import { listAppliedMigrations, loadMigrations } from "./migrate";
import type { DatabaseStatus, IngestionType } from "./schema";

const scalar = (database: Database.Database, sql: string): number => (database.prepare(sql).get() as { count: number }).count;

export function getDatabaseStatus(database: Database.Database, path = getDatabasePath()): DatabaseStatus {
  const appliedMigrations = listAppliedMigrations(database);
  const available = loadMigrations().map(({ version }) => version);
  const latestRuns = database.prepare(`SELECT id, ingestion_type, status, started_at, inserted_count, updated_count, unchanged_count, failed_count
    FROM ingestion_runs ORDER BY started_at DESC LIMIT 5`).all() as Array<{
      id: string; ingestion_type: IngestionType; status: string; started_at: string;
      inserted_count: number; updated_count: number; unchanged_count: number; failed_count: number;
    }>;
  return {
    path,
    appliedMigrations,
    pendingMigrations: available.filter((version) => !appliedMigrations.includes(version)),
    totalJobs: scalar(database, "SELECT COUNT(*) AS count FROM jobs"),
    fixtureDerived: scalar(database, "SELECT COUNT(*) AS count FROM jobs WHERE record_kind = 'fixture_derived'"),
    fictional: scalar(database, "SELECT COUNT(*) AS count FROM jobs WHERE record_kind = 'fictional_demo'"),
    jobKorea: scalar(database, "SELECT COUNT(*) AS count FROM jobs WHERE source = 'jobkorea'"),
    albamon: scalar(database, "SELECT COUNT(*) AS count FROM jobs WHERE source = 'albamon'"),
    withCoordinates: scalar(database, `SELECT COUNT(*) AS count FROM jobs j WHERE
      (j.display_map_latitude IS NOT NULL AND j.display_map_longitude IS NOT NULL)
      OR EXISTS (SELECT 1 FROM workplaces w WHERE w.job_id = j.id AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL AND w.is_headquarters_only = 0)`),
    withoutCoordinates: scalar(database, `SELECT COUNT(*) AS count FROM jobs j WHERE NOT (
      (j.display_map_latitude IS NOT NULL AND j.display_map_longitude IS NOT NULL)
      OR EXISTS (SELECT 1 FROM workplaces w WHERE w.job_id = j.id AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL AND w.is_headquarters_only = 0))`),
    latestRuns: latestRuns.map((run) => ({ id: run.id, ingestionType: run.ingestion_type, status: run.status, startedAt: run.started_at,
      inserted: run.inserted_count, updated: run.updated_count, unchanged: run.unchanged_count, failed: run.failed_count })),
  };
}
