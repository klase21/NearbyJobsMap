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

const PARSER_VERSION = "jobkorea-listing-backfill-v1";

function buildRecord(candidate: JobKoreaCollectionCandidate, options: JobKoreaBackfillOptions, observedAt: string): IngestionRecord {
  const fields = candidate.listingFields!;
  const location = trustworthyJobKoreaListingLocation(fields);
  const listing: JobKoreaListing = { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.sourceUrl,
    title: fields.title!.trim(), companyName: fields.companyName!.trim(), salaryText: fields.salaryText, regionText: location,
    categories: [], employmentTypes: fields.employmentTypes, experienceRequirement: fields.experienceRequirement,
    educationRequirement: fields.educationRequirement, postedAt: fields.postedAt, deadlineText: fields.deadlineText,
    promoted: candidate.listingClassification === "explicit_promoted", capturedAt: observedAt };
  const job = { ...normalizeJobKorea(listing), postingStatus: "unknown" as const, collectedAt: observedAt,
    lastVerifiedAt: observedAt, rawPayloadReference: null };
  const quality = assessJobDataQuality(job);
  return { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation",
    sourceFixtureReference: `bounded_listing_backfill:${options.presetId}:listing_playwright:${candidate.pageNumber}:${candidate.sourcePosition}:${candidate.listingClassification}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`,
    mapPosition: null, permissionStatus: "unverified", listingUrl: options.searchUrl, detailUrl: null, observedAt,
    sanitizerVersion: PARSER_VERSION, parserVersion: PARSER_VERSION, observationKind: "bounded_listing_collection",
    observationTransport: "playwright", pageNumber: candidate.pageNumber, listingPosition: candidate.sourcePosition,
    collectionPresetId: options.presetId, collectionPresetLabel: options.presetLabel, collectionKeyword: options.keyword,
    requestedRegions: ["seoul", "gyeonggi"], normalizedRegions: candidate.normalizedRegions,
    regionConfidence: candidate.regionConfidence, regionEvidenceSource: location ? (candidate.regionConfidence === "mapped_city" ? "mapped_displayed_location" : "displayed_location") : "unknown",
    sourceAreaCode: null, displayedLocationPresent: Boolean(location), detailAccessStatus: "not_attempted",
    observedLinkCount: candidate.observedLinkCount, ...quality } };
}

export async function backfillJobKoreaListingsOnce(options: JobKoreaBackfillOptions, dependencies: JobKoreaBackfillDependencies): Promise<JobKoreaBackfillResult> {
  const started = performance.now(); const pageNumbers = Array.from({ length: options.pageTo - options.pageFrom + 1 }, (_, index) => options.pageFrom + index);
  const qualityBefore = auditJobKoreaDataQuality(dependencies.database);
  const execution = await (dependencies.createExecution ?? createJobKoreaSearchExecution)({ searchUrl: options.searchUrl,
    pages: pageNumbers.length as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, pageNumbers, maxDetails: 0,
    transport: "playwright", confirm: true, dryRun: options.mode === "dry-run", diagnostic: false });
  try {
    const selection = selectJobKoreaCollectionCandidates(execution.pages, options.maxCandidates, ["seoul", "gyeonggi"], options.exclusion,
      { requireCompleteListingCard: true });
    const blocked = execution.pages.filter((page) => page.blocked).length;
    const pageClassifications = execution.pages.reduce<Record<string, number>>((counts, page) => {
      counts[page.classification] = (counts[page.classification] ?? 0) + 1; return counts;
    }, {});
    const parserFailurePages = execution.pages.filter((page) => page.parserFailure).length;
    const unresolvedPageFailures = execution.pages.filter((page) => page.parserFailure && !(page.collectionCandidates ?? []).some((candidate) =>
      Boolean(candidate.listingFields?.title?.trim() && candidate.listingFields.companyName?.trim()))).length;
    const partial = execution.pages.length !== pageNumbers.length || unresolvedPageFailures > 0;
    if (options.mode === "write" && (blocked > 0 || partial || selection.candidates.length === 0 || selection.locationContaminationRejected > 0)) {
      throw new Error(`JOBKOREA_BACKFILL_WRITE_GATE_FAILED:blocked=${blocked},unresolved=${unresolvedPageFailures},selected=${selection.candidates.length},contaminated=${selection.locationContaminationRejected}`);
    }
    const now = dependencies.now ?? (() => new Date());
    const records = selection.candidates.map((candidate) => buildRecord(candidate, options, now().toISOString()));
    const jobs = new JobRepository(dependencies.database);
    const previews = records.map((record) => jobs.previewUpsert(record.job, record.metadata));
    const predictedInserts = previews.filter(({ action }) => action === "inserted").length;
    const predictedUpdates = previews.filter(({ action }) => action === "updated").length;
    const predictedUnchanged = previews.filter(({ action }) => action === "unchanged").length;
    const predictedSkips = previews.filter(({ action }) => action === "skipped").length;
    let runId: string | null = null, actualInserts = 0, actualUpdates = 0, actualUnchanged = 0, actualSkips = 0, failedItems = 0;
    let observationsAdded = 0, changeEventsAdded = 0, qualityMetadataRepairs = 0;
    if (options.mode === "write") {
      const beforeObservations = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_observations").get() as { count: number }).count);
      const beforeChanges = Number((dependencies.database.prepare("SELECT COUNT(*) count FROM job_change_events").get() as { count: number }).count);
      dependencies.database.transaction(() => {
        qualityMetadataRepairs = persistJobKoreaQualityMetadata(dependencies.database);
        const runs = new IngestionRunRepository(dependencies.database);
        runId = runs.begin("jobkorea", "jobkorea_one_shot_transport", records.length, { permissionStatus: "unverified",
          listingUrl: options.searchUrl, maxDetails: options.maxCandidates, contentRequestLimit: pageNumbers.length, preflightRequestLimit: 0,
          dryRun: false, selectedTransport: "playwright", searchPageCount: pageNumbers.length,
          exclusionKeywords: options.exclusion.keywords, exclusionFields: options.exclusion.fields,
          exclusionConfigHash: exclusionConfigurationHash(options.exclusion) });
        runs.updateExclusionSummary(runId, selection.exclusion.candidatesExcluded, records.length);
        const ingested = new IngestionService(dependencies.database).ingest(records, { source: "jobkorea", ingestionType: "jobkorea_one_shot_transport" },
          { runId, transportCompletion: { preflightRequests: 0, contentRequests: execution.searchNavigationCount,
            selectedDetailCount: records.length, blockedCount: execution.pages.filter((page) => page.blocked).length,
            browserNavigations: execution.searchNavigationCount, detailNavigations: 0, directRequests: 0 } });
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
      observationsAdded, changeEventsAdded, qualityMetadataRepairs, qualityBefore, qualityAfter,
      detailRequests: 0, browserDetailNavigations: execution.detailNavigationCount, retries: 0, elapsedMs: Math.round(performance.now() - started) };
  } finally { await execution.close(); }
}
