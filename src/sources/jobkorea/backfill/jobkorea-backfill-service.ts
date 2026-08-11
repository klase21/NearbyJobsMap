import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionRecord } from "../../../db/schema";
import { assessJobDataQuality } from "../../../services/job-data-quality";
import { exclusionConfigurationHash } from "../../../services/collection-exclusion-hash.server";
import { normalizeJobKorea } from "../normalize";
import type { JobKoreaListing } from "../types";
import { selectJobKoreaCollectionCandidates, trustworthyJobKoreaListingLocation } from "../collection/jobkorea-collection-service";
import { createJobKoreaSearchExecution } from "../transport/jobkorea-search-execution";
import type { JobKoreaCollectionCandidate } from "../collection/jobkorea-collection-types";
import { auditJobKoreaDataQuality, assertJobKoreaDatabaseIntegrity, persistJobKoreaQualityMetadata } from "./jobkorea-quality-audit";
import type { JobKoreaBackfillDependencies, JobKoreaBackfillOptions, JobKoreaBackfillResult } from "./jobkorea-backfill-types";
import { classifyPostingDateEvidenceAt, koreaCalendarDate, resolvePostingDateAtCutoff } from "../../../services/collection-date";
import { createJobKoreaHttpTodayExecution } from "../today/jobkorea-http-today";

const PARSER_VERSION = "jobkorea-listing-backfill-v1";

function buildRecord(candidate: JobKoreaCollectionCandidate, options: JobKoreaBackfillOptions, observedAt: string): IngestionRecord {
  const fields = candidate.listingFields!;
  const sourcePostingDate = fields.postingDateEvidence?.raw ?? fields.postedAt;
  const date = options.backfillCutoffDate ? resolvePostingDateAtCutoff(sourcePostingDate, observedAt, options.backfillCutoffDate)
    : options.collectionDate ? classifyPostingDateEvidenceAt(sourcePostingDate, observedAt, options.collectionDate.resolvedDate) : null;
  const location = trustworthyJobKoreaListingLocation(fields);
  const listing: JobKoreaListing = { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.sourceUrl,
    title: fields.title!.trim(), companyName: fields.companyName!.trim(), salaryText: fields.salaryText, regionText: location,
    categories: [], employmentTypes: fields.employmentTypes, experienceRequirement: fields.experienceRequirement,
    educationRequirement: fields.educationRequirement, postedAt: date?.estimatedPostedAt ?? date?.resolvedDate ?? fields.postedAt, deadlineText: fields.deadlineText,
    promoted: candidate.listingClassification === "explicit_promoted", capturedAt: observedAt };
  const job = { ...normalizeJobKorea(listing), postingStatus: "unknown" as const, collectedAt: observedAt,
    lastVerifiedAt: observedAt, rawPayloadReference: null };
  const quality = assessJobDataQuality(job);
  const httpToday = options.localTodayMode === true;
  return { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
    sourceFixtureReference: `bounded_listing_backfill:${options.presetId}:${httpToday ? "listing_http_post:sort2:size50" : "listing_playwright"}:${candidate.pageNumber}:${candidate.sourcePosition}:${candidate.listingClassification}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`,
    mapPosition: null, permissionStatus: "unverified", listingUrl: options.searchUrl, detailUrl: null, observedAt,
    sanitizerVersion: PARSER_VERSION, parserVersion: httpToday ? "jobkorea-http-today-v1" : PARSER_VERSION, observationKind: "bounded_listing_collection",
    observationTransport: httpToday ? "direct" : "playwright", pageNumber: candidate.pageNumber, listingPosition: candidate.sourcePosition,
    collectionPresetId: options.presetId, collectionPresetLabel: options.presetLabel, collectionKeyword: options.keyword,
    requestedRegions: options.requestedRegions ?? ["seoul", "gyeonggi"], normalizedRegions: candidate.normalizedRegions,
    regionConfidence: candidate.regionConfidence, regionEvidenceSource: location ? (candidate.regionConfidence === "mapped_city" ? "mapped_displayed_location" : "displayed_location") : "unknown",
    sourceAreaCode: null, displayedLocationPresent: Boolean(location), detailAccessStatus: "not_attempted",
    observedLinkCount: candidate.observedLinkCount, postingDateEvidence: date?.evidence ?? sourcePostingDate,
    postingDateStatus: date?.status ?? "unknown", postingDateLocalDate: date?.resolvedDate ?? null, ...quality } };
}

export async function backfillJobKoreaListingsOnce(options: JobKoreaBackfillOptions, dependencies: JobKoreaBackfillDependencies): Promise<JobKoreaBackfillResult> {
  const started = performance.now(); const pageNumbers = Array.from({ length: options.pageTo - options.pageFrom + 1 }, (_, index) => options.pageFrom + index);
  const qualityBefore = auditJobKoreaDataQuality(dependencies.database);
  const createExecution = dependencies.createExecution ?? (options.localTodayMode ? createJobKoreaHttpTodayExecution : createJobKoreaSearchExecution);
  const execution = await createExecution({ searchUrl: options.searchUrl,
    pages: pageNumbers.length, pageNumbers, maxDetails: 0,
    transport: options.localTodayMode ? "direct" : "playwright", confirm: true, dryRun: options.mode === "dry-run", diagnostic: false,
    localTodayMode: options.localTodayMode === true, ...(options.collectionDate ? { collectionDate: options.collectionDate } : {}),
    ...(options.backfillCutoffDate ? { backfillCutoffDate: options.backfillCutoffDate } : {}), ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onPage ? { onPage: options.onPage } : {}) });
  try {
    const now = dependencies.now ?? (() => new Date());
    const postingDateCounts = { today: 0, older: 0, unknown: 0, futureInvalid: 0 };
    const postingDateKinds = { minuteRelative: 0, hourRelative: 0, dayRelative: 0, absolute: 0, midnightAmbiguous: 0 };
    const postingDateEvidenceExamples = [...new Set(execution.pages.flatMap((page) => (page.collectionCandidates ?? [])
      .map((candidate) => candidate.listingFields?.postingDateEvidence?.raw).filter((value): value is string => Boolean(value))))].slice(0, 5);
    const eligiblePages = options.collectionDate || options.backfillCutoffDate ? execution.pages.map((page) => {
      const pageObservedAt = page.observedAt ?? now().toISOString();
      return { ...page, observedAt: pageObservedAt, collectionCandidates: (page.collectionCandidates ?? []).filter((candidate) => {
      const raw = candidate.listingFields?.postingDateEvidence?.raw ?? candidate.listingFields?.postedAt;
      const classification = options.backfillCutoffDate ? resolvePostingDateAtCutoff(raw, pageObservedAt, options.backfillCutoffDate)
        : classifyPostingDateEvidenceAt(raw, pageObservedAt, options.collectionDate!.resolvedDate);
      const status = classification.status;
      if (/^\d{1,4}\s*분/u.test(raw ?? "")) postingDateKinds.minuteRelative += 1;
      else if (/^\d{1,3}\s*시간/u.test(raw ?? "")) postingDateKinds.hourRelative += 1;
      else if (/^\d+\s*일/u.test(raw ?? "")) postingDateKinds.dayRelative += 1;
      else if (/\d{1,2}[.\-/]\d{1,2}/u.test(raw ?? "")) postingDateKinds.absolute += 1;
      if (classification.midnightAmbiguous) postingDateKinds.midnightAmbiguous += 1;
      if (status === "today") postingDateCounts.today += 1; else if (status === "older") postingDateCounts.older += 1;
      else if (status === "future_invalid") postingDateCounts.futureInvalid += 1; else postingDateCounts.unknown += 1;
      return options.backfillCutoffDate ? "onOrAfterCutoff" in classification && classification.onOrAfterCutoff === true : status === "today";
    }) }; }) : execution.pages;
    const selection = selectJobKoreaCollectionCandidates(eligiblePages, options.maxCandidates, options.requestedRegions ?? ["seoul", "gyeonggi"], options.exclusion,
      { requireCompleteListingCard: true });
    const blocked = execution.pages.filter((page) => page.blocked).length;
    const pageClassifications = execution.pages.reduce<Record<string, number>>((counts, page) => {
      counts[page.classification] = (counts[page.classification] ?? 0) + 1; return counts;
    }, {});
    const parserFailurePages = execution.pages.filter((page) => page.parserFailure).length;
    const unresolvedPageFailures = execution.pages.filter((page) => page.parserFailure && !(page.collectionCandidates ?? []).some((candidate) =>
      Boolean(candidate.listingFields?.title?.trim() && candidate.listingFields.companyName?.trim()))).length;
    const partial = (!execution.completedByExhaustion && execution.pages.length !== pageNumbers.length) || unresolvedPageFailures > 0;
    if (options.mode === "write" && (blocked > 0 || partial || selection.candidates.length === 0 || selection.locationContaminationRejected > 0)) {
      throw new Error(`JOBKOREA_BACKFILL_WRITE_GATE_FAILED:blocked=${blocked},unresolved=${unresolvedPageFailures},selected=${selection.candidates.length},contaminated=${selection.locationContaminationRejected}`);
    }
    const records = selection.candidates.map((candidate) => buildRecord(candidate, options, candidate.observedAt ?? now().toISOString()));
    const jobs = new JobRepository(dependencies.database);
    const previews = records.map((record) => jobs.previewUpsert(record.job, record.metadata));
    const predictedInserts = previews.filter(({ action }) => action === "inserted").length;
    const predictedUpdates = previews.filter(({ action }) => action === "updated").length;
    const predictedUnchanged = previews.filter(({ action }) => action === "unchanged").length;
    const predictedSkips = previews.filter(({ action }) => action === "skipped").length;
    const salaryDisplayPresent = records.filter(({ job }) => job.salary.originalText.trim()).length;
    const salaryDisplayMissing = records.length - salaryDisplayPresent;
    const structuredSalaryTypes = new Set(["annual", "monthly", "hourly", "daily", "per_task"]);
    const structuredSalary = records.filter(({ job }) =>
      structuredSalaryTypes.has(job.salary.type)
      && (job.salary.minimumAmount !== null || job.salary.maximumAmount !== null));
    const annualStructuredSalary = structuredSalary.filter(({ job }) => job.salary.type === "annual").length;
    const monthlyStructuredSalary = structuredSalary.filter(({ job }) => job.salary.type === "monthly").length;
    const otherStructuredSalary = structuredSalary.length - annualStructuredSalary - monthlyStructuredSalary;
    const structuredSalaryIdentities = new Set(structuredSalary.map(({ job }) => `${job.source}:${job.sourcePostingId}`));
    const validUnstructuredSalary = records.filter(({ job }) =>
      job.salary.originalText.trim()
      && !structuredSalaryIdentities.has(`${job.source}:${job.sourcePostingId}`)).length;
    const rejectedSalaryCandidates = selection.candidates.filter((candidate) => candidate.listingFields?.salaryCandidateRejected === true).length;
    const salaryExamples = [...new Set(records.map(({ job }) => job.salary.originalText.trim()).filter(Boolean))].slice(0, 20);
    let runId: string | null = null, actualInserts = 0, actualUpdates = 0, actualUnchanged = 0, actualSkips = 0, failedItems = 0;
    let observationsAdded = 0, changeEventsAdded = 0, qualityMetadataRepairs = 0;
    if (options.mode === "write" && options.signal?.aborted) throw new Error("JOBKOREA_BACKFILL_CANCELLED");
    if (options.mode === "write") {
      const beforeObservations = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_observations").get() as { count: number }).count);
      const beforeChanges = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_change_events").get() as { count: number }).count);
      dependencies.database.transaction(() => {
        qualityMetadataRepairs = persistJobKoreaQualityMetadata(dependencies.database);
        const runs = new IngestionRunRepository(dependencies.database);
        runId = runs.begin("jobkorea", "jobkorea_one_shot_transport", records.length, { permissionStatus: "unverified",
          listingUrl: options.searchUrl, maxDetails: options.maxCandidates, contentRequestLimit: pageNumbers.length, preflightRequestLimit: 0,
          dryRun: false, selectedTransport: execution.transportUsed === "http_post_listing" ? "direct" : execution.transportUsed, searchPageCount: execution.pages.length,
          exclusionKeywords: options.exclusion.keywords, exclusionFields: options.exclusion.fields,
          exclusionConfigHash: exclusionConfigurationHash(options.exclusion), collectionDateScope: options.collectionDate ? "today" : "all",
          collectionTimezone: options.collectionDate?.timezone ?? (options.backfillCutoffDate ? "Asia/Seoul" : null),
          collectionLocalDate: options.collectionDate?.resolvedDate ?? (options.backfillCutoffDate ? koreaCalendarDate(now()) : null),
          postingDateCounts, operationKind: options.backfillCutoffDate ? "manual_backfill" : "collection",
          cutoffDate: options.backfillCutoffDate ?? null });
        if (options.backfillCutoffDate) {
          const resolvedDates = execution.pages.flatMap((page) => (page.collectionCandidates ?? []).map((candidate) =>
            resolvePostingDateAtCutoff(candidate.listingFields?.postingDateEvidence?.raw, page.observedAt ?? now().toISOString(), options.backfillCutoffDate!).resolvedDate)
            .filter((value): value is string => Boolean(value)));
          runs.updateBackfillSummary(runId, { pagesScanned: execution.pages.length,
            stopReason: execution.stopReason === "older_page" ? "cutoff_reached" : execution.stopReason ?? "page_limit",
            oldestPostingDate: resolvedDates.length ? [...resolvedDates].sort()[0]! : null });
        }
        runs.updateExclusionSummary(runId, selection.exclusion.candidatesExcluded, records.length);
        const ingested = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" },
          { runId, transportCompletion: { preflightRequests: 0, contentRequests: execution.searchNavigationCount + execution.directRequestCount,
            selectedDetailCount: records.length, blockedCount: execution.pages.filter((page) => page.blocked).length,
            browserNavigations: execution.searchNavigationCount, detailNavigations: 0, directRequests: execution.directRequestCount } });
        actualInserts = ingested.inserted; actualUpdates = ingested.updated; actualUnchanged = ingested.unchanged;
        actualSkips = ingested.skipped; failedItems = ingested.failed;
        if (failedItems) throw new Error(`JOBKOREA_BACKFILL_FAILED_ITEMS:${failedItems}`);
        qualityMetadataRepairs += persistJobKoreaQualityMetadata(dependencies.database);
        (dependencies.validateWrite ?? ((ids) => assertJobKoreaDatabaseIntegrity(dependencies.database, ids)))(records.map(({ job }) => job.sourcePostingId));
      })();
      observationsAdded = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_observations").get() as { count: number }).count) - beforeObservations;
      changeEventsAdded = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_change_events").get() as { count: number }).count) - beforeChanges;
    }
    const qualityAfter = auditJobKoreaDataQuality(dependencies.database);
    return { mode: options.mode, runId, status: blocked ? "blocked" : partial ? "partial" : "completed", pageResults: execution.pages,
      pagesRequested: pageNumbers.length, pagesCompleted: execution.pages.length, parserFailurePages, unresolvedPageFailures, pageClassifications,
      linksExtracted: execution.pages.reduce((sum, page) => sum + (page.extractedCount ?? 0), 0), uniquePostingIds: selection.uniquePostingIds,
      crossPageDuplicates: selection.crossPageDuplicates, validCards: selection.validListingCards, invalidCards: selection.invalidListingCards,
      seoulCandidates: selection.seoulMatches, gyeonggiCandidates: selection.gyeonggiMatches,
      multipleRegionCandidates: selection.multipleRegionMatches, unknownRegionCandidates: selection.unknownRegionCandidates,
      otherRegionCandidates: selection.otherRegionCandidates, excludedByRegion: selection.excludedByRegion,
      excludedByKeyword: selection.exclusion.candidatesExcluded, locationContaminationRejected: selection.locationContaminationRejected,
      selectedCandidates: records.length, predictedInserts, predictedUpdates, predictedUnchanged, predictedSkips,
      predictedObservations: predictedInserts + predictedUpdates + predictedUnchanged,
      predictedChangeEvents: predictedUpdates, actualInserts, actualUpdates, actualUnchanged, actualSkips, failedItems,
      salaryDisplayPresent, salaryDisplayMissing, annualStructuredSalary, monthlyStructuredSalary, otherStructuredSalary,
      validUnstructuredSalary, rejectedSalaryCandidates, salaryExamples,
      observationsAdded, changeEventsAdded, qualityMetadataRepairs, qualityBefore, qualityAfter,
      detailRequests: 0, browserDetailNavigations: execution.detailNavigationCount, retries: 0, elapsedMs: Math.round(performance.now() - started),
      postingDateCounts, postingDateEvidenceExamples, postingDateKinds, transportUsed: execution.transportUsed,
      ...(execution.stopReason ? { stopReason: execution.stopReason } : {}) };
  } finally { await execution.close(); }
}
