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
       content_request_limit, preflight_request_limit, dry_run, selected_transport, search_page_count,
       exclusion_keywords_json, exclusion_fields_json, exclusion_config_hash, saved_profile_id, saved_profile_name,
       saved_profile_revision, saved_profile_configuration_hash, collection_date_scope, collection_timezone, collection_local_date,
       posting_today_count, posting_older_count, posting_unknown_count, posting_future_invalid_count, source_failure_count,
       operation_kind, cutoff_date, pages_scanned, stop_reason, oldest_posting_date, pre_write_backup_file, created_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, source, ingestionType, now, inputRecordCount, metadata?.permissionStatus ?? null, metadata?.listingUrl ?? null,
        metadata?.maxDetails ?? null, metadata?.contentRequestLimit ?? null, metadata?.preflightRequestLimit ?? null,
        metadata?.dryRun ? 1 : 0, metadata?.selectedTransport ?? null, metadata?.searchPageCount ?? 0,
        JSON.stringify(metadata?.exclusionKeywords ?? []), JSON.stringify(metadata?.exclusionFields ?? []), metadata?.exclusionConfigHash ?? null,
        metadata?.savedProfileId ?? null, metadata?.savedProfileName ?? null, metadata?.savedProfileRevision ?? null,
        metadata?.savedProfileConfigurationHash ?? null, metadata?.collectionDateScope ?? "all", metadata?.collectionTimezone ?? null,
        metadata?.collectionLocalDate ?? null, metadata?.postingDateCounts?.today ?? 0, metadata?.postingDateCounts?.older ?? 0,
        metadata?.postingDateCounts?.unknown ?? 0, metadata?.postingDateCounts?.futureInvalid ?? 0, metadata?.sourceFailureCount ?? 0,
        metadata?.operationKind ?? "collection", metadata?.cutoffDate ?? null, metadata?.pagesScanned ?? 0, metadata?.stopReason ?? null,
        metadata?.oldestPostingDate ?? null, metadata?.preWriteBackupFile ?? null, now);
    return id;
  }

  updateExclusionSummary(runId: string, excludedCandidateCount: number, selectedCandidateCountAfterExclusion: number): void {
    this.database.prepare(`UPDATE ingestion_runs SET excluded_candidate_count = ?, selected_candidate_count_after_exclusion = ? WHERE id = ?`)
      .run(excludedCandidateCount, selectedCandidateCountAfterExclusion, runId);
  }

  updateTodaySummary(runId: string, counts: { today: number; older: number; unknown: number; futureInvalid: number }, sourceFailureCount = 0): void {
    this.database.prepare(`UPDATE ingestion_runs SET posting_today_count=?, posting_older_count=?, posting_unknown_count=?,
      posting_future_invalid_count=?, source_failure_count=? WHERE id=?`)
      .run(counts.today, counts.older, counts.unknown, counts.futureInvalid, sourceFailureCount, runId);
  }

  updateBackfillSummary(runId: string, input: { pagesScanned: number; stopReason: string; oldestPostingDate: string | null }): void {
    this.database.prepare("UPDATE ingestion_runs SET operation_kind='manual_backfill', pages_scanned=?, stop_reason=?, oldest_posting_date=? WHERE id=?")
      .run(input.pagesScanned, input.stopReason.slice(0, 80), input.oldestPostingDate, runId);
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
      skipped_count = ?, failed_count = ?, preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ?,
      browser_navigation_count = ?, detail_navigation_count = ?, direct_request_count = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), result.inserted, result.updated, result.unchanged, result.skipped, result.failed,
        transport?.preflightRequests ?? 0, transport?.contentRequests ?? 0, transport?.selectedDetailCount ?? 0, transport?.blockedCount ?? 0,
        transport?.browserNavigations ?? 0, transport?.detailNavigations ?? 0, transport?.directRequests ?? 0, runId);
  }

  fail(runId: string, summary: string, transport?: Partial<TransportRunCompletion>): void {
    this.database.prepare(`UPDATE ingestion_runs SET status = 'failed', completed_at = ?, error_summary = ?,
      preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ?,
      browser_navigation_count = ?, detail_navigation_count = ?, direct_request_count = ? WHERE id = ?`)
      .run(new Date().toISOString(), summary.slice(0, 1000), transport?.preflightRequests ?? 0, transport?.contentRequests ?? 0,
        transport?.selectedDetailCount ?? 0, transport?.blockedCount ?? 0, transport?.browserNavigations ?? 0,
        transport?.detailNavigations ?? 0, transport?.directRequests ?? 0, runId);
  }

  block(runId: string, summary: string, transport: TransportRunCompletion): void {
    this.database.prepare(`UPDATE ingestion_runs SET status = 'blocked', completed_at = ?, error_summary = ?, permission_status = 'blocked',
      preflight_request_count = ?, content_request_count = ?, selected_detail_count = ?, blocked_count = ?,
      browser_navigation_count = ?, detail_navigation_count = ?, direct_request_count = ? WHERE id = ?`)
      .run(new Date().toISOString(), summary.slice(0, 1000), transport.preflightRequests, transport.contentRequests,
        transport.selectedDetailCount, transport.blockedCount, transport.browserNavigations ?? 0,
        transport.detailNavigations ?? 0, transport.directRequests ?? 0, runId);
  }
}
