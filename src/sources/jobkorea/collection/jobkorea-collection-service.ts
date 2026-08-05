import { validateCanonicalJob } from "../../../db/job-validation";
import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionRecord, TransportRunCompletion } from "../../../db/schema";
import type { PostingStatus } from "../../../domain/posting-status";
import { parseJobKoreaDetail } from "../detail-parser";
import { normalizeJobKorea } from "../normalize";
import type { JobKoreaListing } from "../types";
import { JobKoreaTransportError } from "../transport/jobkorea-error";
import { JobKoreaHttpClient } from "../transport/jobkorea-http-client";
import { JobKoreaRequestBudget } from "../transport/jobkorea-request-budget";
import { classifyJobKoreaResponse } from "../transport/jobkorea-response-classifier";
import { createJobKoreaSearchExecution } from "../transport/jobkorea-search-execution";
import type { JobKoreaSearchOptions } from "../transport/jobkorea-search-types";
import { JOBKOREA_PARSER_CONTRACT_VERSION, JOBKOREA_SANITIZER_VERSION, sanitizeJobKoreaDetail } from "../transport/jobkorea-sanitizer";
import { normalizeJobKoreaUrl, sourcePostingIdFromUrl } from "../transport/jobkorea-url-policy";
import type { JobKoreaCollectedDetailOutcome, JobKoreaCollectionCandidate, JobKoreaCollectionDependencies, JobKoreaCollectionOptions, JobKoreaCollectionResult } from "./jobkorea-collection-types";

export const JOBKOREA_COLLECTION_DETAIL_CONCURRENCY = 2;
export const JOBKOREA_COLLECTION_DRY_RUN_DEADLINE_MS = 90_000;
export const JOBKOREA_COLLECTION_WRITE_DEADLINE_MS = 8 * 60_000;

export function selectJobKoreaCollectionCandidates(pages: JobKoreaCollectionResult["pageResults"], maximum: number): { candidates: JobKoreaCollectionCandidate[]; uniquePostingIds: number } {
  const seen = new Set<string>(); const all: JobKoreaCollectionCandidate[] = [];
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const candidate of [...(page.collectionCandidates ?? [])].sort((a, b) => a.firstSourcePosition - b.firstSourcePosition)) {
      if (seen.has(candidate.postingId)) continue;
      seen.add(candidate.postingId);
      all.push({ sourcePostingId: candidate.postingId, sourceUrl: candidate.canonicalUrl, pageNumber: page.pageNumber,
        sourcePosition: candidate.firstSourcePosition, observedLinkCount: candidate.observedLinkCount,
        listingClassification: candidate.listingClassification });
    }
  }
  return { candidates: all.slice(0, maximum), uniquePostingIds: seen.size };
}

function listing(candidate: JobKoreaCollectionCandidate, capturedAt: string): JobKoreaListing {
  return { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.sourceUrl, title: `잡코리아 공고 ${candidate.sourcePostingId}`,
    companyName: "상세 페이지 확인 전", salaryText: null, regionText: null, categories: [], employmentTypes: [],
    experienceRequirement: null, educationRequirement: null, postedAt: null, deadlineText: null,
    promoted: candidate.listingClassification === "explicit_promoted", capturedAt };
}

function detailStatus(status: PostingStatus): "active" | "expired" | "closed" {
  return status === "closed" ? "closed" : status === "expired" ? "expired" : "active";
}

function failureStatus(code: string): JobKoreaCollectedDetailOutcome["status"] {
  if (/ACCESS_BLOCKED|LOGIN|VERIFICATION|CAPTCHA/.test(code)) return "access_blocked";
  if (/NOT_FOUND|DELETED|REMOVED/.test(code)) return "deleted";
  if (/PARSER|SANITIZER/.test(code)) return "parse_failed";
  if (/ID_MISMATCH|CANONICAL|DETAIL_PAGE_INVALID|ROOT_REDIRECT/.test(code)) return "invalid_detail";
  return "transport_failed";
}

async function concurrentMap<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) { const index = next; next += 1; results[index] = await worker(values[index]!); }
  }));
  return results;
}

export async function collectJobKoreaOnce(options: JobKoreaCollectionOptions, dependencies: JobKoreaCollectionDependencies): Promise<JobKoreaCollectionResult> {
  const started = performance.now(); const deadline = options.mode === "dry-run" ? JOBKOREA_COLLECTION_DRY_RUN_DEADLINE_MS : JOBKOREA_COLLECTION_WRITE_DEADLINE_MS;
  const runs = new IngestionRunRepository(dependencies.database); const jobs = new JobRepository(dependencies.database);
  const httpClient = dependencies.httpClient ?? new JobKoreaHttpClient();
  const httpBudget = JobKoreaRequestBudget.forManualDetailCollection(options.maxDetails);
  const now = dependencies.now ?? (() => new Date()); let runId: string | null = null;
  if (options.mode === "write") runId = runs.begin("jobkorea", "jobkorea_one_shot_transport", options.maxDetails, {
    permissionStatus: "unverified", listingUrl: options.searchUrl, maxDetails: options.maxDetails,
    contentRequestLimit: options.pages + options.maxDetails, preflightRequestLimit: 0, dryRun: false,
    selectedTransport: "playwright", searchPageCount: options.pages,
  });
  const executionOptions: JobKoreaSearchOptions = { searchUrl: options.searchUrl, pages: options.pages, maxDetails: options.maxDetails,
    transport: "playwright", confirm: true, dryRun: options.mode === "dry-run", diagnostic: false };
  let execution: Awaited<ReturnType<typeof createJobKoreaSearchExecution>> | null = null;
  try {
    execution = await (dependencies.createExecution ?? createJobKoreaSearchExecution)(executionOptions);
    const blockedPages = execution.pages.filter((page) => page.blocked).length;
    const selection = selectJobKoreaCollectionCandidates(execution.pages, options.maxDetails);
    const records: IngestionRecord[] = []; const outcomes = await concurrentMap(selection.candidates, JOBKOREA_COLLECTION_DETAIL_CONCURRENCY, async (candidate) => {
      if (performance.now() - started >= deadline) return { sourcePostingId: candidate.sourcePostingId, status: "transport_failed", parserResult: "failed", databaseAction: "not_stored", diagnosticCodes: ["JOBKOREA_COLLECTION_DEADLINE_EXCEEDED"], transport: "playwright" } satisfies JobKoreaCollectedDetailOutcome;
      try {
        const observedAt = now().toISOString();
        const httpResponse = await httpClient.request(candidate.sourceUrl, "detail", httpBudget);
        const responseClassification = classifyJobKoreaResponse(httpResponse, "detail");
        const response = { finalUrl: httpResponse.finalUrl, html: httpResponse.body, explicitClosed: responseClassification === "closed_detail" };
        const finalId = sourcePostingIdFromUrl(normalizeJobKoreaUrl(response.finalUrl, "detail"));
        if (finalId !== candidate.sourcePostingId) throw new JobKoreaTransportError("JOBKOREA_DETAIL_ID_MISMATCH", "요청한 공고 ID와 상세 페이지 ID가 일치하지 않습니다.", response.finalUrl);
        const reduced = sanitizeJobKoreaDetail(response.html, response.finalUrl, observedAt, response.explicitClosed);
        const parsed = parseJobKoreaDetail(reduced); const errors = parsed.diagnostics.filter((item) => item.severity === "error");
        if (!parsed.value || errors.length) throw new JobKoreaTransportError("JOBKOREA_DETAIL_PARSER_FAILURE", errors.map((item) => item.message).join(" ") || "상세 parser 결과가 없습니다.", response.finalUrl);
        if (parsed.value.sourcePostingId !== candidate.sourcePostingId || !parsed.value.title?.trim() || !parsed.value.companyName?.trim()) throw new JobKoreaTransportError("JOBKOREA_DETAIL_ID_MISMATCH", "상세 공고의 ID, 제목 또는 회사명이 유효하지 않습니다.", response.finalUrl);
        const job = { ...normalizeJobKorea(listing(candidate, observedAt), parsed.value), sourceUrl: response.finalUrl,
          canonicalUrl: response.finalUrl, collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
        const issues = validateCanonicalJob(job); if (issues.length) throw new JobKoreaTransportError("JOBKOREA_CANONICAL_VALIDATION_FAILED", issues.map((item) => item.code).join(", "), response.finalUrl);
        const sourceReference = `bounded_manual_collection:${candidate.pageNumber}:${candidate.sourcePosition}:${candidate.listingClassification}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`;
        const record: IngestionRecord = { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
          sourceFixtureReference: sourceReference, mapPosition: null, permissionStatus: "unverified", listingUrl: options.searchUrl,
          detailUrl: response.finalUrl, observedAt, sanitizerVersion: JOBKOREA_SANITIZER_VERSION, parserVersion: JOBKOREA_PARSER_CONTRACT_VERSION,
          observationKind: "bounded_manual_collection", observationTransport: "playwright", pageNumber: candidate.pageNumber,
          listingPosition: candidate.sourcePosition } };
        records.push(record); const preview = jobs.previewUpsert(job, record.metadata);
        return { sourcePostingId: candidate.sourcePostingId, status: detailStatus(job.postingStatus), parserResult: "parsed",
          databaseAction: preview.action, diagnosticCodes: parsed.diagnostics.map((item) => item.code), transport: "http" } satisfies JobKoreaCollectedDetailOutcome;
      } catch (error) {
        const code = error instanceof JobKoreaTransportError ? error.code : "JOBKOREA_DETAIL_PROCESSING_FAILED";
        if (runId) runs.recordItem({ runId, source: "jobkorea", sourcePostingId: candidate.sourcePostingId,
          canonicalJobId: `jobkorea:${candidate.sourcePostingId}`, result: "failed", diagnosticCodes: [code], contentHash: null });
        return { sourcePostingId: candidate.sourcePostingId, status: failureStatus(code), parserResult: "failed",
          databaseAction: "not_stored", diagnosticCodes: [code], transport: "http" } satisfies JobKoreaCollectedDetailOutcome;
      }
    });
    const failed = outcomes.filter((item) => item.parserResult === "failed").length;
    const completion: TransportRunCompletion = { preflightRequests: 0, contentRequests: execution.searchNavigationCount + httpBudget.contentRequests + execution.detailNavigationCount,
      selectedDetailCount: selection.candidates.length, blockedCount: blockedPages, browserNavigations: execution.searchNavigationCount,
      detailNavigations: execution.detailNavigationCount, directRequests: 0 };
    let actualInserts = 0, actualUpdates = 0, actualUnchanged = 0;
    if (runId) {
      const ingested = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" }, { runId, initial: { failed }, transportCompletion: completion });
      actualInserts = ingested.inserted; actualUpdates = ingested.updated; actualUnchanged = ingested.unchanged;
    }
    const parsed = outcomes.filter((item) => item.parserResult === "parsed");
    const result: JobKoreaCollectionResult = { runId, mode: options.mode, status: blockedPages && !parsed.length ? "blocked" : failed || execution.pages.length < options.pages ? "partial" : "completed",
      pageResults: execution.pages, listingPagesRequested: options.pages, listingPagesCompleted: execution.pages.length,
      numericLinksExtracted: execution.pages.reduce((sum, page) => sum + (page.extractedCount ?? 0), 0), uniquePostingIds: selection.uniquePostingIds,
      candidatesSelected: selection.candidates.length, detailPagesAttempted: outcomes.length, successfullyParsed: parsed.length,
      activeJobs: parsed.filter((item) => item.status === "active").length, expiredOrClosedJobs: parsed.filter((item) => item.status === "expired" || item.status === "closed").length,
      transportFailures: outcomes.filter((item) => item.status === "transport_failed").length, blockedDetails: outcomes.filter((item) => item.status === "access_blocked").length,
      parseFailures: outcomes.filter((item) => item.status === "parse_failed" || item.status === "invalid_detail").length,
      predictedInserts: parsed.filter((item) => item.databaseAction === "inserted").length, predictedUpdates: parsed.filter((item) => item.databaseAction === "updated").length,
      predictedUnchanged: parsed.filter((item) => item.databaseAction === "unchanged").length, actualInserts, actualUpdates, actualUnchanged,
      totalSqliteJobs: jobs.listAll().length, details: outcomes, elapsedMs: Math.round(performance.now() - started) };
    return result;
  } catch (error) {
    if (runId) runs.fail(runId, error instanceof Error ? error.message : "수동 수집 실패");
    throw error;
  } finally { await execution?.close(); }
}
