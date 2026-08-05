import type Database from "better-sqlite3";
import { validateCanonicalJob } from "../../../db/job-validation";
import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionDiagnostic, IngestionRecord } from "../../../db/schema";
import { parseJobKoreaDetail } from "../detail-parser";
import { parseJobKoreaListing } from "../listing-parser";
import { normalizeJobKorea } from "../normalize";
import type { JobKoreaListing } from "../types";
import { JobKoreaTransportError } from "./jobkorea-error";
import { JobKoreaHttpClient } from "./jobkorea-http-client";
import { getJobKoreaContentRequestLimit, JobKoreaRequestBudget, JOBKOREA_PREFLIGHT_REQUEST_LIMIT } from "./jobkorea-request-budget";
import { preflightJobKoreaRobots } from "./jobkorea-robots";
import { classifyJobKoreaResponse } from "./jobkorea-response-classifier";
import { JOBKOREA_PARSER_CONTRACT_VERSION, JOBKOREA_SANITIZER_VERSION, sanitizeJobKoreaDetail, sanitizeJobKoreaListing } from "./jobkorea-sanitizer";
import { sourcePostingIdFromUrl } from "./jobkorea-url-policy";
import type { JobKoreaDetailOutcome, JobKoreaOneShotResult, JobKoreaTransportDiagnostic, JobKoreaTransportOptions } from "./types";

const diagnostic = (code: string, message: string, sourcePostingId: string | null = null, url: string | null = null): JobKoreaTransportDiagnostic => ({ code, message, sourcePostingId, url });
const isBlockedCode = (code: string): boolean => ["JOBKOREA_ACCESS_BLOCKED", "JOBKOREA_LOGIN_REDIRECT", "JOBKOREA_VERIFICATION_PAGE"].includes(code);

export interface JobKoreaOneShotDependencies {
  database: Database.Database;
  httpClient?: JobKoreaHttpClient;
  now?: () => Date;
}

export async function runJobKoreaOneShot(options: JobKoreaTransportOptions, dependencies: JobKoreaOneShotDependencies): Promise<JobKoreaOneShotResult> {
  const budget = new JobKoreaRequestBudget(options.maxDetails);
  const client = dependencies.httpClient ?? new JobKoreaHttpClient();
  const now = dependencies.now ?? (() => new Date());
  const jobs = new JobRepository(dependencies.database);
  const runs = new IngestionRunRepository(dependencies.database);
  const diagnostics: JobKoreaTransportDiagnostic[] = [];
  const details: JobKoreaDetailOutcome[] = [];
  let runId: string | null = null;
  let listingCandidates = 0;
  let rejectedCandidates = 0;
  let selectedCandidates = 0;
  let blocked = 0;
  let externalFailed = 0;
  if (!options.dryRun) runId = runs.begin("jobkorea", "jobkorea_one_shot_transport", options.maxDetails, {
    permissionStatus: "unverified", listingUrl: options.listingUrl, maxDetails: options.maxDetails,
    contentRequestLimit: getJobKoreaContentRequestLimit(options.maxDetails), preflightRequestLimit: JOBKOREA_PREFLIGHT_REQUEST_LIMIT, dryRun: false,
  });

  const baseResult = (): Omit<JobKoreaOneShotResult, "status" | "permissionStatus" | "inserted" | "updated" | "unchanged" | "skipped" | "failed"> => ({
    runId, dryRun: options.dryRun, preflightRequests: budget.preflightRequests, contentRequests: budget.contentRequests,
    listingRequests: budget.listingRequests, detailRequests: budget.detailRequests, listingCandidates, rejectedCandidates,
    selectedCandidates, blocked, diagnostics, details,
  });

  const robots = await preflightJobKoreaRobots(client, budget, options.listingUrl);
  diagnostics.push(diagnostic(robots.diagnosticCode, robots.message));
  if (robots.blocked) {
    blocked = 1;
    const completion = { preflightRequests: budget.preflightRequests, contentRequests: 0, selectedDetailCount: 0, blockedCount: 1 };
    if (runId) runs.block(runId, robots.message, completion);
    return { ...baseResult(), status: "blocked", permissionStatus: "blocked", inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  }

  const selected: JobKoreaListing[] = [];
  try {
    const listingResponse = await client.request(options.listingUrl, "listing", budget);
    classifyJobKoreaResponse(listingResponse, "listing");
    const sanitized = sanitizeJobKoreaListing(listingResponse.body, listingResponse.finalUrl, now().toISOString());
    listingCandidates = sanitized.observed;
    rejectedCandidates += sanitized.rejected.length;
    for (const rejected of sanitized.rejected) diagnostics.push(diagnostic(rejected.code, "허용되지 않은 상세 후보 URL을 건너뛰었습니다."));
    const parsed = parseJobKoreaListing(sanitized.fixture);
    for (const item of parsed.diagnostics) diagnostics.push(diagnostic(item.code, item.message));
    const seen = new Set<string>();
    for (const item of parsed.items) {
      if (!item.value) {
        rejectedCandidates += 1;
        item.diagnostics.forEach((entry) => diagnostics.push(diagnostic(entry.code, entry.message)));
        continue;
      }
      if (seen.has(item.value.sourceUrl)) { rejectedCandidates += 1; diagnostics.push(diagnostic("JOBKOREA_DUPLICATE_CANDIDATE", "중복 상세 후보를 건너뛰었습니다.", item.value.sourcePostingId, item.value.sourceUrl)); continue; }
      seen.add(item.value.sourceUrl);
      if (selected.length < options.maxDetails) selected.push(item.value);
    }
    selectedCandidates = selected.length;
    if (!selected.length) throw new JobKoreaTransportError("JOBKOREA_ZERO_LISTING_CANDIDATES", "유효한 상세 후보가 없습니다.", listingResponse.finalUrl);
  } catch (error) {
    const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_LISTING_PARSER_FAILURE", "목록 처리에 실패했습니다.", options.listingUrl, { cause: error });
    diagnostics.push(diagnostic(transport.code, transport.message, null, transport.url));
    if (runId) runs.fail(runId, `${transport.code}: ${transport.message}`, { preflightRequests: budget.preflightRequests, contentRequests: budget.contentRequests, selectedDetailCount: 0, blockedCount: 0 });
    return { ...baseResult(), status: "failed", permissionStatus: "unverified", inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 1 };
  }

  const records: IngestionRecord[] = [];
  for (const listing of selected) {
    const sourcePostingId = listing.sourcePostingId || sourcePostingIdFromUrl(listing.sourceUrl);
    try {
      const response = await client.request(listing.sourceUrl, "detail", budget);
      const classification = classifyJobKoreaResponse(response, "detail");
      const observedAt = now().toISOString();
      const reduced = sanitizeJobKoreaDetail(response.body, response.finalUrl, observedAt, classification === "closed_detail");
      const parsed = parseJobKoreaDetail(reduced);
      const errors = parsed.diagnostics.filter(({ severity }) => severity === "error");
      if (!parsed.value || errors.length) throw new JobKoreaTransportError("JOBKOREA_DETAIL_PARSER_FAILURE", errors.map(({ message }) => message).join(" ") || "상세 parser 결과가 없습니다.", response.finalUrl);
      const job = { ...normalizeJobKorea(listing, parsed.value), sourceUrl: response.finalUrl, canonicalUrl: response.finalUrl,
        collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
      const validation = validateCanonicalJob(job);
      if (validation.length) throw new JobKoreaTransportError("JOBKOREA_CANONICAL_VALIDATION_FAILED", validation.map(({ code }) => code).join(", "), response.finalUrl);
      const record: IngestionRecord = { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
        sourceFixtureReference: `jobkorea-one-shot:${response.finalUrl}`, mapPosition: null, permissionStatus: "unverified",
        listingUrl: options.listingUrl, detailUrl: response.finalUrl, observedAt, sanitizerVersion: JOBKOREA_SANITIZER_VERSION,
        parserVersion: JOBKOREA_PARSER_CONTRACT_VERSION } };
      records.push(record);
      const preview = jobs.previewUpsert(job, record.metadata);
      details.push({ sourcePostingId, url: response.finalUrl, result: preview.action, diagnosticCodes: parsed.diagnostics.map(({ code }) => code), contentHash: preview.contentHash });
    } catch (error) {
      const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_DETAIL_PROCESSING_FAILED", "상세 처리에 실패했습니다.", listing.sourceUrl, { cause: error });
      const detailBlocked = isBlockedCode(transport.code);
      if (detailBlocked) blocked += 1; else externalFailed += 1;
      diagnostics.push(diagnostic(transport.code, transport.message, sourcePostingId, transport.url ?? listing.sourceUrl));
      details.push({ sourcePostingId, url: listing.sourceUrl, result: detailBlocked ? "blocked" : "failed", diagnosticCodes: [transport.code], contentHash: null });
      if (runId) runs.recordItem({ runId, source: "jobkorea", sourcePostingId, canonicalJobId: sourcePostingId ? `jobkorea:${sourcePostingId}` : null,
        result: "failed", diagnosticCodes: [transport.code], contentHash: null });
    }
  }

  let inserted = 0; let updated = 0; let unchanged = 0; let skipped = 0; let failed = externalFailed;
  if (options.dryRun) {
    for (const detail of details) {
      if (detail.result === "inserted") inserted += 1;
      else if (detail.result === "updated") updated += 1;
      else if (detail.result === "unchanged") unchanged += 1;
    }
  } else if (runId) {
    const ingestionDiagnostics: IngestionDiagnostic[] = diagnostics.filter(({ sourcePostingId }) => sourcePostingId !== null).map((entry) => ({
      source: "jobkorea", sourcePostingId: entry.sourcePostingId, code: entry.code, message: entry.message,
    }));
    const ingestion = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" }, {
      runId, initial: { failed: externalFailed, diagnostics: ingestionDiagnostics },
      transportCompletion: { preflightRequests: budget.preflightRequests, contentRequests: budget.contentRequests,
        selectedDetailCount: selectedCandidates, blockedCount: blocked },
    });
    ({ inserted, updated, unchanged, skipped, failed } = ingestion);
  }
  const status = failed > 0 || blocked > 0 ? "partial" : "completed";
  return { ...baseResult(), status, permissionStatus: "unverified", inserted, updated, unchanged, skipped, failed };
}
