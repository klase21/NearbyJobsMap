import type Database from "better-sqlite3";
import type { JobSource } from "../../domain/job-source";
import { calculateJobContentHash } from "../content-hash";
import { validateCanonicalJob } from "../job-validation";
import { IngestionRunRepository } from "../repositories/ingestion-run-repository";
import { JobRepository, JobRepositoryError } from "../repositories/job-repository";
import type { IngestionDiagnostic, IngestionRecord, IngestionResult, IngestionSource, IngestionType, TransportRunCompletion } from "../schema";

export interface IngestionExecutionOptions {
  runId?: string;
  initial?: { inserted?: number; updated?: number; unchanged?: number; skipped?: number; failed?: number; diagnostics?: IngestionDiagnostic[] };
  transportCompletion?: TransportRunCompletion;
}

const identityKey = ({ job }: IngestionRecord): string => job.sourcePostingId.trim()
  ? `${job.source}:id:${job.sourcePostingId}`
  : `${job.source}:url:${job.canonicalUrl ?? ""}`;

function safeSource(value: unknown): JobSource {
  return value === "albamon" || value === "work24" ? value : "jobkorea";
}

export class IngestionService {
  private readonly jobs: JobRepository;
  private readonly runs: IngestionRunRepository;

  constructor(private readonly database: Database.Database) {
    this.jobs = new JobRepository(database);
    this.runs = new IngestionRunRepository(database);
  }

  ingest(records: IngestionRecord[], input: { source: IngestionSource; ingestionType: IngestionType }, options: IngestionExecutionOptions = {}): IngestionResult {
    const runId = options.runId ?? this.runs.begin(input.source, input.ingestionType, records.length);
    const result: IngestionResult = { runId, inserted: options.initial?.inserted ?? 0, updated: options.initial?.updated ?? 0,
      unchanged: options.initial?.unchanged ?? 0, skipped: options.initial?.skipped ?? 0, failed: options.initial?.failed ?? 0,
      diagnostics: [...(options.initial?.diagnostics ?? [])] };
    const seen = new Set<string>();
    try {
      for (const record of records) {
        const source = safeSource(record?.job?.source);
        const sourcePostingId = typeof record?.job?.sourcePostingId === "string" ? record.job.sourcePostingId || null : null;
        const canonicalJobId = typeof record?.job?.id === "string" && record.job.id ? record.job.id : null;
        let identity: string;
        let validation: ReturnType<typeof validateCanonicalJob>;
        try {
          identity = identityKey(record);
          validation = validateCanonicalJob(record.job);
        } catch {
          result.failed += 1;
          result.diagnostics.push({ source, sourcePostingId, code: "INGESTION_RECORD_INVALID_SHAPE", message: "CanonicalJob 입력 구조가 유효하지 않습니다." });
          this.runs.recordItem({ runId, source, sourcePostingId, canonicalJobId, result: "failed", diagnosticCodes: ["INGESTION_RECORD_INVALID_SHAPE"], contentHash: null });
          continue;
        }
        if (seen.has(identity)) {
          result.skipped += 1;
          result.diagnostics.push({ source, sourcePostingId, code: "DUPLICATE_INPUT_IDENTITY", message: "같은 입력 묶음에 동일한 exact source identity가 중복됐습니다." });
          this.runs.recordItem({ runId, source, sourcePostingId, canonicalJobId: record.job.id, result: "skipped", diagnosticCodes: ["DUPLICATE_INPUT_IDENTITY"], contentHash: null });
          continue;
        }
        seen.add(identity);
        if (validation.length) {
          result.failed += 1;
          const codes = validation.map(({ code }) => code);
          validation.forEach(({ code, message }) => result.diagnostics.push({ source, sourcePostingId, code, message }));
          this.runs.recordItem({ runId, source, sourcePostingId, canonicalJobId: record.job.id || null, result: "failed", diagnosticCodes: codes, contentHash: null });
          continue;
        }
        try {
          const upsert = this.jobs.upsert(record.job, record.metadata);
          result[upsert.action] += 1;
          this.runs.recordItem({ runId, source, sourcePostingId, canonicalJobId: upsert.jobId, result: upsert.action, diagnosticCodes: [], contentHash: upsert.contentHash });
        } catch (error) {
          result.failed += 1;
          const code = error instanceof JobRepositoryError ? error.code : "INGESTION_RECORD_FAILED";
          result.diagnostics.push({ source, sourcePostingId, code, message: error instanceof Error ? error.message : "레코드 수집 실패" });
          this.runs.recordItem({ runId, source, sourcePostingId, canonicalJobId: record.job.id, result: "failed", diagnosticCodes: [code], contentHash: calculateJobContentHash(record.job, record.metadata.mapPosition) });
        }
      }
      this.runs.complete(runId, result, options.transportCompletion);
      return result;
    } catch (error) {
      const summary = error instanceof Error ? error.message : "ingestion run 실패";
      try { this.runs.fail(runId, summary, options.transportCompletion); } catch { /* The original failure remains authoritative. */ }
      throw error;
    }
  }
}
