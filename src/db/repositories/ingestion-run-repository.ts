import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { JobSource } from "../../domain/job-source";
import type { IngestionItemResult, IngestionResult, IngestionSource, IngestionType, TransportRunCompletion, TransportRunMetadata } from "../schema";

export class IngestionRunRepository {
  constructor(private readonly database: Database.Database) {}

  begin(source: IngestionSource, ingestionType: IngestionType, inputRecordCount: number, metadata?: TransportRunMetadata): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO ingestion_runs
      (id, source, ingestion_type, status, started_at, input_record_count, permission_status, listing_url, max_details,
       content_request_limit, preflight_request_limit, dry_run, created_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, source, ingestionType, now, inputRecordCount, metadata?.permissionStatus ?? null, metadata?.listingUrl ?? null,
        metadata?.maxDetails ?? null, metadata?.contentRequestLimit ?? null, metadata?.preflightRequestLimit ?? null,
        metadata?.dryRun ? 1 : 0, now);
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

  complete(runId: string, result: Omit<IngestionResult, "runId" | "diagnostics">, transport?: TransportRunCompletion): void {
    const status = result.failed > 0 || (transport?.blockedCount ?? 0) > 0 ? "partial" : "completed";
    this.database.prepare(`UPDATE ingestion_runs SET status = ?, completed_at = ?, inserted_count = ?, updated_count = ?, unchanged_count = ?,
      skipped_count = ?, failed_count = ?, preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), result.inserted, result.updated, result.unchanged, result.skipped, result.failed,
        transport?.preflightRequests ?? 0, transport?.contentRequests ?? 0, transport?.selectedDetailCount ?? 0, transport?.blockedCount ?? 0, runId);
  }

  fail(runId: string, summary: string, transport?: Partial<TransportRunCompletion>): void {
    this.database.prepare(`UPDATE ingestion_runs SET status = 'failed', completed_at = ?, error_summary = ?,
      preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ? WHERE id = ?`)
      .run(new Date().toISOString(), summary.slice(0, 1000), transport?.preflightRequests ?? 0, transport?.contentRequests ?? 0,
        transport?.selectedDetailCount ?? 0, transport?.blockedCount ?? 0, runId);
  }

  block(runId: string, summary: string, transport: TransportRunCompletion): void {
    this.database.prepare(`UPDATE ingestion_runs SET status = 'blocked', completed_at = ?, error_summary = ?, permission_status = 'blocked',
      preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ? WHERE id = ?`)
      .run(new Date().toISOString(), summary.slice(0, 1000), transport.preflightRequests, transport.contentRequests,
        transport.selectedDetailCount, transport.blockedCount, runId);
  }
}
