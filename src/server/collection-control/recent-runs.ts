import "server-only";
import type Database from "better-sqlite3";
import type { RecentCollectionRun } from "./contracts";

export function listRecentCollectionRuns(database: Database.Database, limit = 10): RecentCollectionRun[] {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const rows = database.prepare(`SELECT r.id, r.started_at, r.completed_at, r.status, r.selected_detail_count,
    r.source, r.inserted_count, r.updated_count, r.unchanged_count, r.skipped_count, r.failed_count,
    MAX(j.collection_preset_id) AS preset_id, MAX(j.collection_preset_label) AS preset_label
    FROM ingestion_runs r
    LEFT JOIN ingestion_items i ON i.ingestion_run_id = r.id
    LEFT JOIN jobs j ON j.id = i.canonical_job_id
    WHERE r.source IN ('jobkorea', 'albamon') AND r.dry_run = 0
    GROUP BY r.id ORDER BY r.started_at DESC LIMIT ?`).all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const startedAt = String(row.started_at); const completedAt = row.completed_at ? String(row.completed_at) : null;
    return { id: String(row.id), startedAt, completedAt, source: row.source === "albamon" ? "albamon" : "jobkorea", presetId: typeof row.preset_id === "string" ? row.preset_id : null,
      presetLabel: typeof row.preset_label === "string" ? row.preset_label : row.source === "albamon" ? "알바몬 수동 수집" : "잡코리아 수동 수집",
      attempted: Number(row.selected_detail_count ?? 0), inserted: Number(row.inserted_count ?? 0), updated: Number(row.updated_count ?? 0),
      unchanged: Number(row.unchanged_count ?? 0), skipped: Number(row.skipped_count ?? 0), failed: Number(row.failed_count ?? 0),
      durationMs: completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : null, status: String(row.status) };
  });
}
