import "server-only";
import type Database from "better-sqlite3";
import type { RecentManualBackfill } from "./contracts";

export function listRecentManualBackfills(database: Database.Database, limit = 10): RecentManualBackfill[] {
  const bounded = Math.max(1, Math.min(20, Math.trunc(limit)));
  return (database.prepare(`SELECT id,source,started_at,completed_at,cutoff_date,pages_scanned,input_record_count,inserted_count,updated_count,unchanged_count,stop_reason,status
    FROM ingestion_runs WHERE operation_kind='manual_backfill' ORDER BY started_at DESC LIMIT ?`).all(bounded) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), source: row.source as RecentManualBackfill["source"], startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : null, cutoffDate: row.cutoff_date ? String(row.cutoff_date) : null, pages: Number(row.pages_scanned),
      records: Number(row.input_record_count), inserted: Number(row.inserted_count), updated: Number(row.updated_count), unchanged: Number(row.unchanged_count),
      stopReason: row.stop_reason ? String(row.stop_reason) : null, status: String(row.status),
    }));
}
