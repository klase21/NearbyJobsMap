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
import { JOBKOREA_MANUAL_DETAIL_REDIRECT_HOPS, JobKoreaRequestBudget } from "../transport/jobkorea-request-budget";
import { classifyJobKoreaResponse } from "../transport/jobkorea-response-classifier";
import { createJobKoreaSearchExecution } from "../transport/jobkorea-search-execution";
import type { JobKoreaSearchOptions } from "../transport/jobkorea-search-types";
import { JOBKOREA_PARSER_CONTRACT_VERSION, JOBKOREA_SANITIZER_VERSION, sanitizeJobKoreaDetail } from "../transport/jobkorea-sanitizer";
import { normalizeJobKoreaUrl, sourcePostingIdFromUrl } from "../transport/jobkorea-url-policy";
import type { JobKoreaHttpResponse } from "../transport/types";
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
        listingClassification: candidate.listingClassification, listingFields: candidate.listingFields ?? null });
    }
  }
  return { candidates: all.slice(0, maximum), uniquePostingIds: seen.size };
}

function listing(candidate: JobKoreaCollectionCandidate, capturedAt: string): JobKoreaListing {
  const fields = candidate.listingFields;
  return { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.sourceUrl, title: fields?.title?.trim() || `잡코리아 공고 ${candidate.sourcePostingId}`,
    companyName: fields?.companyName?.trim() || "상세 페이지 확인 전", salaryText: fields?.salaryText ?? null, regionText: fields?.regionText ?? null,
    categories: [], employmentTypes: fields?.employmentTypes ?? [], experienceRequirement: fields?.experienceRequirement ?? null,
    educationRequirement: fields?.educationRequirement ?? null, postedAt: fields?.postedAt ?? null, deadlineText: fields?.deadlineText ?? null,
    promoted: candidate.listingClassification === "explicit_promoted", capturedAt };
}

const hasValidListingFallback = (candidate: JobKoreaCollectionCandidate): boolean => Boolean(
  candidate.listingFields?.title?.trim() && candidate.listingFields.companyName?.trim(),
);

function collectionRecord(candidate: JobKoreaCollectionCandidate, options: JobKoreaCollectionOptions, observedAt: string,
  job: ReturnType<typeof normalizeJobKorea>, completeness: "detail_complete" | "listing_only", detailUrl: string | null): IngestionRecord {
  const sourceReference = completeness === "detail_complete"
    ? `bounded_manual_collection:detail_http:${candidate.pageNumber}:${candidate.sourcePosition}:${candidate.listingClassification}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`
    : `bounded_listing_collection:listing_playwright:${candidate.pageNumber}:${candidate.sourcePosition}:${candidate.listingClassification}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`;
  return { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
    sourceFixtureReference: sourceReference, mapPosition: null, permissionStatus: "unverified", listingUrl: options.searchUrl,
    detailUrl, observedAt, sanitizerVersion: completeness === "detail_complete" ? JOBKOREA_SANITIZER_VERSION : "jobkorea-listing-card-v1",
    parserVersion: completeness === "detail_complete" ? JOBKOREA_PARSER_CONTRACT_VERSION : "jobkorea-listing-card-v1",
    observationKind: completeness === "detail_complete" ? "bounded_manual_collection" : "bounded_listing_collection",
    observationTransport: "playwright", pageNumber: candidate.pageNumber, listingPosition: candidate.sourcePosition } };
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
    contentRequestLimit: options.pages + options.maxDetails * (JOBKOREA_MANUAL_DETAIL_REDIRECT_HOPS + 1), preflightRequestLimit: 0, dryRun: false,
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
      if (performance.now() - started >= deadline) return { sourcePostingId: candidate.sourcePostingId, requestedUrl: candidate.sourceUrl,
        finalUrl: null, httpStatus: null, redirectCount: null, redirectClassification: "not_observed", redirectChain: [],
        status: "transport_failed", parserResult: "failed", canonicalValidation: "not_reached", databaseAction: "not_stored",
        diagnosticCodes: ["JOBKOREA_COLLECTION_DEADLINE_EXCEEDED"], transport: "http", dataCompleteness: "none" } satisfies JobKoreaCollectedDetailOutcome;
      let httpResponse: JobKoreaHttpResponse | null = null;
      const observedAt = now().toISOString();
      try {
        httpResponse = await httpClient.request(candidate.sourceUrl, "detail", httpBudget);
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
        const record = collectionRecord(candidate, options, observedAt, job, "detail_complete", response.finalUrl);
        records.push(record); const preview = jobs.previewUpsert(job, record.metadata);
        return { sourcePostingId: candidate.sourcePostingId, requestedUrl: httpResponse.requestedUrl, finalUrl: httpResponse.finalUrl,
          httpStatus: httpResponse.status, redirectCount: httpResponse.redirectCount, redirectClassification: httpResponse.redirectClassification,
          redirectChain: httpResponse.redirectChain, status: detailStatus(job.postingStatus), parserResult: "parsed", canonicalValidation: "passed",
          databaseAction: preview.action, diagnosticCodes: parsed.diagnostics.map((item) => item.code), transport: "http", dataCompleteness: "detail_complete" } satisfies JobKoreaCollectedDetailOutcome;
      } catch (error) {
        const code = error instanceof JobKoreaTransportError ? error.code : "JOBKOREA_DETAIL_PROCESSING_FAILED";
        const errorContext = error instanceof JobKoreaTransportError ? error.context : null;
        const redirectClassification = code === "JOBKOREA_ACCESS_BLOCKED" ? "access_denied"
          : errorContext?.redirectClassification ?? httpResponse?.redirectClassification ?? "not_observed";
        if (options.allowListingFallback && hasValidListingFallback(candidate)) {
          const fallbackJob = { ...normalizeJobKorea(listing(candidate, observedAt)), postingStatus: "unknown" as const,
            collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
          const issues = validateCanonicalJob(fallbackJob);
          if (!issues.length) {
            const record = collectionRecord(candidate, options, observedAt, fallbackJob, "listing_only", null);
            records.push(record); const preview = jobs.previewUpsert(fallbackJob, record.metadata);
            return { sourcePostingId: candidate.sourcePostingId, requestedUrl: errorContext?.requestedUrl ?? httpResponse?.requestedUrl ?? candidate.sourceUrl,
              finalUrl: errorContext?.finalUrl ?? httpResponse?.finalUrl ?? null, httpStatus: errorContext?.httpStatus ?? httpResponse?.status ?? null,
              redirectCount: errorContext?.redirectCount ?? httpResponse?.redirectCount ?? null, redirectClassification,
              redirectChain: errorContext?.redirectChain ?? httpResponse?.redirectChain ?? [], status: failureStatus(code), parserResult: "failed",
              canonicalValidation: "passed", databaseAction: preview.action, diagnosticCodes: [code, "JOBKOREA_LISTING_FALLBACK_USED"],
              transport: "http", dataCompleteness: "listing_only" } satisfies JobKoreaCollectedDetailOutcome;
          }
        }
        if (runId) runs.recordItem({ runId, source: "jobkorea", sourcePostingId: candidate.sourcePostingId,
          canonicalJobId: `jobkorea:${candidate.sourcePostingId}`, result: "failed", diagnosticCodes: [code], contentHash: null });
        return { sourcePostingId: candidate.sourcePostingId, requestedUrl: errorContext?.requestedUrl ?? httpResponse?.requestedUrl ?? candidate.sourceUrl,
          finalUrl: errorContext?.finalUrl ?? httpResponse?.finalUrl ?? (error instanceof JobKoreaTransportError ? error.url : null),
          httpStatus: errorContext?.httpStatus ?? httpResponse?.status ?? null,
          redirectCount: errorContext?.redirectCount ?? httpResponse?.redirectCount ?? null,
          redirectClassification, redirectChain: errorContext?.redirectChain ?? httpResponse?.redirectChain ?? [],
          status: failureStatus(code), parserResult: "failed", canonicalValidation: code === "JOBKOREA_CANONICAL_VALIDATION_FAILED" ? "failed" : "not_reached",
          databaseAction: "not_stored", diagnosticCodes: [code], transport: "http", dataCompleteness: "none" } satisfies JobKoreaCollectedDetailOutcome;
      }
    });
    const failed = outcomes.filter((item) => item.databaseAction === "not_stored").length;
    const completion: TransportRunCompletion = { preflightRequests: 0, contentRequests: execution.searchNavigationCount + httpBudget.contentRequests + execution.detailNavigationCount,
      selectedDetailCount: selection.candidates.length, blockedCount: blockedPages, browserNavigations: execution.searchNavigationCount,
      detailNavigations: execution.detailNavigationCount, directRequests: 0 };
    let actualInserts = 0, actualUpdates = 0, actualUnchanged = 0, actualLowerCompletenessSkips = 0;
    if (runId) {
      const ingested = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" }, { runId, initial: { failed }, transportCompletion: completion });
      actualInserts = ingested.inserted; actualUpdates = ingested.updated; actualUnchanged = ingested.unchanged;
      actualLowerCompletenessSkips = ingested.skipped;
    }
    const parsed = outcomes.filter((item) => item.parserResult === "parsed");
    const result: JobKoreaCollectionResult = { runId, mode: options.mode, status: blockedPages && !parsed.length ? "blocked" : failed || execution.pages.length < options.pages ? "partial" : "completed",
      pageResults: execution.pages, listingPagesRequested: options.pages, listingPagesCompleted: execution.pages.length,
      numericLinksExtracted: execution.pages.reduce((sum, page) => sum + (page.extractedCount ?? 0), 0), uniquePostingIds: selection.uniquePostingIds,
      candidatesSelected: selection.candidates.length, detailPagesAttempted: outcomes.length, successfullyParsed: parsed.length,
      activeJobs: parsed.filter((item) => item.status === "active").length, expiredOrClosedJobs: parsed.filter((item) => item.status === "expired" || item.status === "closed").length,
      transportFailures: outcomes.filter((item) => item.status === "transport_failed").length, blockedDetails: outcomes.filter((item) => item.status === "access_blocked").length,
      parseFailures: outcomes.filter((item) => item.status === "parse_failed" || item.status === "invalid_detail").length,
      predictedInserts: outcomes.filter((item) => item.databaseAction === "inserted").length, predictedUpdates: outcomes.filter((item) => item.databaseAction === "updated").length,
      predictedUnchanged: outcomes.filter((item) => item.databaseAction === "unchanged").length, actualInserts, actualUpdates, actualUnchanged,
      listingOnlyRecords: outcomes.filter((item) => item.dataCompleteness === "listing_only").length, failedRecords: failed,
      predictedLowerCompletenessSkips: outcomes.filter((item) => item.databaseAction === "skipped").length, actualLowerCompletenessSkips,
      totalSqliteJobs: jobs.listAll().length, details: outcomes, elapsedMs: Math.round(performance.now() - started) };
    return result;
  } catch (error) {
    if (runId) runs.fail(runId, error instanceof Error ? error.message : "수동 수집 실패");
    throw error;
  } finally { await execution?.close(); }
}
