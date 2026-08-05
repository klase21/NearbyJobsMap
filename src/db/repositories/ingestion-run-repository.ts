import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { JobSource } from "../../domain/job-source";
import type { IngestionItemResult, IngestionResult, IngestionSource, IngestionType } from "../schema";

export class IngestionRunRepository {
  constructor(private readonly database: Database.Database) {}

  begin(source: IngestionSource, ingestionType: IngestionType, inputRecordCount: number): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO ingestion_runs
      (id, source, ingestion_type, status, started_at, input_record_count, created_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?)`)
      .run(id, source, ingestionType, now, inputRecordCount, now);
    return id;
  }

  recordItem(input: {
    runId: string;
    source: JobSource;
    sourcePostingId: string | null;
    canonicalJobId: string | null;
    result: IngestionItemResult;
    diagnosticCodes: string[];
    contentHash: string | null;
  }): void {
    this.database.prepare(`INSERT INTO ingestion_items
      (ingestion_run_id, source, source_posting_id, canonical_job_id, result, diagnostic_codes, content_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.runId, input.source, input.sourcePostingId, input.canonicalJobId, input.result, JSON.stringify(input.diagnosticCodes), input.contentHash, new Date().toISOString());
  }

  complete(runId: string, result: Omit<IngestionResult, "runId" | "diagnostics">): void {
    const status = result.failed > 0 ? "partial" : "completed";
    this.database.prepare(`UPDATE ingestion_runs SET status = ?, completed_at = ?, inserted_count = ?, updated_count = ?, unchanged_count = ?,
      skipped_count = ?, failed_count = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), result.inserted, result.updated, result.unchanged, result.skipped, result.failed, runId);
  }

  fail(runId: string, summary: string): void {
    this.database.prepare("UPDATE ingestion_runs SET status = 'failed', completed_at = ?, error_summary = ? WHERE id = ?")
      .run(new Date().toISOString(), summary.slice(0, 1000), runId);
  }
}
