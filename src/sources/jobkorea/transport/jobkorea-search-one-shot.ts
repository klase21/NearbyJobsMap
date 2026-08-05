import type Database from "better-sqlite3";
import { validateCanonicalJob } from "../../../db/job-validation";
import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionRecord, TransportRunCompletion } from "../../../db/schema";
import { parseJobKoreaDetail } from "../detail-parser";
import { normalizeJobKorea } from "../normalize";
import type { JobKoreaListing } from "../types";
import { JobKoreaTransportError } from "./jobkorea-error";
import { JOBKOREA_PAGE1_COMMAND_BUDGET_MS, runBoundedLifecyclePhase, type JobKoreaLifecycleDiagnostic } from "./jobkorea-lifecycle";
import { JobKoreaHttpClient } from "./jobkorea-http-client";
import { JobKoreaRequestBudget, JOBKOREA_PREFLIGHT_REQUEST_LIMIT } from "./jobkorea-request-budget";
import { preflightJobKoreaRobots } from "./jobkorea-robots";
import { createJobKoreaSearchExecution } from "./jobkorea-search-execution";
import { failedSearchPageResult } from "./jobkorea-playwright-search";
import type { JobKoreaSearchExecution, JobKoreaSearchOneShotResult, JobKoreaSearchOptions } from "./jobkorea-search-types";
import { JOBKOREA_PARSER_CONTRACT_VERSION, JOBKOREA_SANITIZER_VERSION, sanitizeJobKoreaDetail } from "./jobkorea-sanitizer";
import type { JobKoreaDetailOutcome } from "./types";

export interface JobKoreaSearchOneShotDependencies {
  database: Database.Database;
  httpClient?: JobKoreaHttpClient;
  createExecution?: (options: JobKoreaSearchOptions) => Promise<JobKoreaSearchExecution>;
  now?: () => Date;
}

function asListing(candidate: JobKoreaSearchExecution["pages"][number]["candidates"][number], capturedAt: string): JobKoreaListing {
  return { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.sourceUrl, title: candidate.title,
    companyName: candidate.companyName, salaryText: null, regionText: null, categories: [], employmentTypes: [],
    experienceRequirement: null, educationRequirement: null, postedAt: null, deadlineText: null,
    promoted: candidate.promoted, capturedAt };
}

export async function runJobKoreaSearchOneShot(options: JobKoreaSearchOptions, dependencies: JobKoreaSearchOneShotDependencies): Promise<JobKoreaSearchOneShotResult> {
  const startedAt = performance.now();
  const selectedTransport = options.transport === "direct" ? "direct" : "playwright";
  const budget = new JobKoreaRequestBudget(Math.max(1, options.maxDetails));
  const client = dependencies.httpClient ?? new JobKoreaHttpClient(fetch, { timeoutMs: 4_000, maxResponseBytes: 512 * 1024 });
  const now = dependencies.now ?? (() => new Date());
  const jobs = new JobRepository(dependencies.database);
  const runs = new IngestionRunRepository(dependencies.database);
  const commandLifecycleDiagnostics: JobKoreaLifecycleDiagnostic[] = [];
  let runId: string | null = null;
  let execution: JobKoreaSearchExecution | null = null;
  let returnedResult: JobKoreaSearchOneShotResult | null = null;
  const finish = (result: JobKoreaSearchOneShotResult): JobKoreaSearchOneShotResult => {
    returnedResult = result;
    return result;
  };
  if (!options.dryRun) runId = runs.begin("jobkorea", "jobkorea_one_shot_transport", options.maxDetails, {
    permissionStatus: "unverified", listingUrl: options.searchUrl, maxDetails: options.maxDetails,
    contentRequestLimit: options.maxDetails, preflightRequestLimit: JOBKOREA_PREFLIGHT_REQUEST_LIMIT, dryRun: false,
    selectedTransport, searchPageCount: options.pages,
  });
  const emptyDirectVerification = { classification: "direct_endpoint_unavailable" as const, observation: null,
    diagnostic: { severity: "warning" as const, code: "JOBKOREA_DIRECT_ENDPOINT_NOT_CHECKED", field: null, message: "direct 계약을 확인하지 않았습니다." } };
  const blockedResult = (message: string): JobKoreaSearchOneShotResult => ({ runId, status: "blocked", permissionStatus: "blocked", dryRun: options.dryRun,
    transportRequested: options.transport, transportUsed: selectedTransport, robotsRequests: budget.preflightRequests, searchNavigations: 0,
    detailNavigations: 0, directRequests: 0, pageResults: [], selectedCandidates: 0, globalDuplicateCount: 0,
    inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, blocked: 1, details: [], consoleErrors: [message], directVerification: emptyDirectVerification,
    lifecycleDiagnostics: [...commandLifecycleDiagnostics], elapsedMs: Math.round(performance.now() - startedAt), internalBudgetMs: JOBKOREA_PAGE1_COMMAND_BUDGET_MS });

  try {
    const robots = await runBoundedLifecyclePhase("robots-preflight", 4_500,
      () => preflightJobKoreaRobots(client, budget, options.searchUrl), commandLifecycleDiagnostics);
    if (robots.blocked) {
      if (runId) runs.block(runId, robots.message, { preflightRequests: budget.preflightRequests, contentRequests: 0,
        selectedDetailCount: 0, blockedCount: 1, browserNavigations: 0, detailNavigations: 0, directRequests: 0 });
      return finish(blockedResult(robots.message));
    }

    execution = await (dependencies.createExecution ?? createJobKoreaSearchExecution)(options);
    const pageResults = execution.pages;
    const blockedPages = pageResults.filter(({ blocked }) => blocked).length;
    const validPages = pageResults.filter(({ classification }) => classification === "valid_search_results" || classification === "valid_empty_results");
    const globalSeen = new Set<string>();
    const ordered = pageResults.flatMap(({ candidates }) => candidates);
    const deduplicated = ordered.filter(({ sourceUrl }) => { if (globalSeen.has(sourceUrl)) return false; globalSeen.add(sourceUrl); return true; });
    const globalDuplicateCount = ordered.length - deduplicated.length;
    const selected = deduplicated.slice(0, options.maxDetails);
    const details: JobKoreaDetailOutcome[] = [];
    const records: IngestionRecord[] = [];
    let externalFailed = 0;

    if (!validPages.length) {
      const completion: TransportRunCompletion = { preflightRequests: budget.preflightRequests, contentRequests: 0,
        selectedDetailCount: 0, blockedCount: blockedPages, browserNavigations: execution.searchNavigationCount,
        detailNavigations: execution.detailNavigationCount, directRequests: execution.directRequestCount };
      const summary = pageResults.flatMap(({ diagnostics }) => diagnostics.map(({ code }) => code)).join(", ") || "JOBKOREA_SEARCH_RESULTS_UNAVAILABLE";
      if (runId) {
        if (blockedPages) runs.block(runId, summary, completion);
        else runs.fail(runId, summary, completion);
      }
      return finish({ runId, status: blockedPages ? "blocked" : "failed", permissionStatus: blockedPages ? "blocked" : "unverified", dryRun: options.dryRun,
        transportRequested: options.transport, transportUsed: execution.transportUsed, robotsRequests: budget.preflightRequests,
        searchNavigations: execution.searchNavigationCount, detailNavigations: execution.detailNavigationCount, directRequests: execution.directRequestCount,
        pageResults, selectedCandidates: 0, globalDuplicateCount, inserted: 0, updated: 0, unchanged: 0, skipped: 0,
        failed: blockedPages ? 0 : 1, blocked: blockedPages, details, consoleErrors: execution.consoleErrors, directVerification: execution.directVerification,
        lifecycleDiagnostics: [...commandLifecycleDiagnostics, ...execution.lifecycleDiagnostics], elapsedMs: Math.round(performance.now() - startedAt), internalBudgetMs: JOBKOREA_PAGE1_COMMAND_BUDGET_MS });
    }

    for (const candidate of selected) {
      try {
        const observedAt = now().toISOString();
        const detailResponse = await execution.fetchDetail(candidate.sourceUrl);
        const reduced = sanitizeJobKoreaDetail(detailResponse.html, detailResponse.finalUrl, observedAt, detailResponse.explicitClosed);
        const parsed = parseJobKoreaDetail(reduced);
        const errors = parsed.diagnostics.filter(({ severity }) => severity === "error");
        if (!parsed.value || errors.length) throw new JobKoreaTransportError("JOBKOREA_DETAIL_PARSER_FAILURE", errors.map(({ message }) => message).join(" ") || "상세 parser 결과가 없습니다.", detailResponse.finalUrl);
        const job = { ...normalizeJobKorea(asListing(candidate, observedAt), parsed.value), sourceUrl: detailResponse.finalUrl,
          canonicalUrl: detailResponse.finalUrl, collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
        const validation = validateCanonicalJob(job);
        if (validation.length) throw new JobKoreaTransportError("JOBKOREA_CANONICAL_VALIDATION_FAILED", validation.map(({ code }) => code).join(", "), detailResponse.finalUrl);
        const record: IngestionRecord = { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
          sourceFixtureReference: `bounded_public_browser_observation:${execution.transportUsed}:${candidate.pageNumber}:${candidate.sourcePostingId}`,
          mapPosition: null, permissionStatus: "unverified", listingUrl: options.searchUrl, detailUrl: detailResponse.finalUrl,
          observedAt, sanitizerVersion: JOBKOREA_SANITIZER_VERSION, parserVersion: JOBKOREA_PARSER_CONTRACT_VERSION,
          observationKind: "bounded_public_browser_observation", observationTransport: execution.transportUsed,
          pageNumber: candidate.pageNumber, listingPosition: candidate.listingPosition } };
        records.push(record);
        const preview = jobs.previewUpsert(job, record.metadata);
        details.push({ sourcePostingId: candidate.sourcePostingId, url: detailResponse.finalUrl, result: preview.action,
          diagnosticCodes: parsed.diagnostics.map(({ code }) => code), contentHash: preview.contentHash });
      } catch (error) {
        externalFailed += 1;
        const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_DETAIL_PROCESSING_FAILED", "상세 처리에 실패했습니다.", candidate.sourceUrl, { cause: error });
        details.push({ sourcePostingId: candidate.sourcePostingId, url: candidate.sourceUrl, result: "failed", diagnosticCodes: [transport.code], contentHash: null });
        if (runId) runs.recordItem({ runId, source: "jobkorea", sourcePostingId: candidate.sourcePostingId,
          canonicalJobId: `jobkorea:${candidate.sourcePostingId}`, result: "failed", diagnosticCodes: [transport.code], contentHash: null });
      }
    }

    let inserted = 0; let updated = 0; let unchanged = 0; let skipped = 0; let failed = externalFailed;
    const completion: TransportRunCompletion = { preflightRequests: budget.preflightRequests, contentRequests: 0,
      selectedDetailCount: selected.length, blockedCount: blockedPages, browserNavigations: execution.searchNavigationCount,
      detailNavigations: execution.detailNavigationCount, directRequests: execution.directRequestCount };
    if (options.dryRun) {
      for (const detail of details) {
        if (detail.result === "inserted") inserted += 1;
        else if (detail.result === "updated") updated += 1;
        else if (detail.result === "unchanged") unchanged += 1;
      }
    } else if (runId) {
      const ingestion = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" }, {
        runId, initial: { failed: externalFailed }, transportCompletion: completion,
      });
      ({ inserted, updated, unchanged, skipped, failed } = ingestion);
    }
    return finish({ runId, status: failed || blockedPages ? "partial" : "completed", permissionStatus: "unverified", dryRun: options.dryRun,
      transportRequested: options.transport, transportUsed: execution.transportUsed, robotsRequests: budget.preflightRequests,
      searchNavigations: execution.searchNavigationCount, detailNavigations: execution.detailNavigationCount, directRequests: execution.directRequestCount,
      pageResults, selectedCandidates: selected.length, globalDuplicateCount, inserted, updated, unchanged, skipped, failed,
      blocked: blockedPages, details, consoleErrors: execution.consoleErrors, directVerification: execution.directVerification,
      lifecycleDiagnostics: [...commandLifecycleDiagnostics, ...execution.lifecycleDiagnostics], elapsedMs: Math.round(performance.now() - startedAt), internalBudgetMs: JOBKOREA_PAGE1_COMMAND_BUDGET_MS });
  } catch (error) {
    const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_SEARCH_COMMAND_FAILED", "잡코리아 검색 원샷 처리에 실패했습니다.", options.searchUrl, { cause: error });
    if (runId) runs.fail(runId, `${transport.code}: ${transport.message}`, { preflightRequests: budget.preflightRequests, contentRequests: 0,
      selectedDetailCount: 0, blockedCount: 0, browserNavigations: execution?.searchNavigationCount ?? 0,
      detailNavigations: execution?.detailNavigationCount ?? 0, directRequests: execution?.directRequestCount ?? 0 });
    const pageResult = failedSearchPageResult(1, "unexpected_page", transport.code);
    return finish({ runId, status: "failed", permissionStatus: "unverified", dryRun: options.dryRun,
      transportRequested: options.transport, transportUsed: selectedTransport, robotsRequests: budget.preflightRequests,
      searchNavigations: execution?.searchNavigationCount ?? 0, detailNavigations: execution?.detailNavigationCount ?? 0,
      directRequests: execution?.directRequestCount ?? 0, pageResults: execution?.pages.length ? execution.pages : [pageResult],
      selectedCandidates: 0, globalDuplicateCount: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0,
      failed: 1, blocked: 0, details: [], consoleErrors: [...(execution?.consoleErrors ?? []), `${transport.code}: ${transport.message}`],
      directVerification: execution?.directVerification ?? emptyDirectVerification,
      lifecycleDiagnostics: [...commandLifecycleDiagnostics, ...(execution?.lifecycleDiagnostics ?? [])], elapsedMs: Math.round(performance.now() - startedAt), internalBudgetMs: JOBKOREA_PAGE1_COMMAND_BUDGET_MS });
  } finally {
    await execution?.close();
    const completedResult = returnedResult as JobKoreaSearchOneShotResult | null;
    if (completedResult) {
      completedResult.lifecycleDiagnostics = [...commandLifecycleDiagnostics, ...(execution?.lifecycleDiagnostics ?? [])];
      completedResult.elapsedMs = Math.round(performance.now() - startedAt);
    }
  }
}
