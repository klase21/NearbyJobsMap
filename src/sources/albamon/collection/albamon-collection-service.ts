import { validateCanonicalJob } from "../../../db/job-validation";
import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionRecord, TransportRunCompletion } from "../../../db/schema";
import { matchesCollectionRegions, normalizeRegionText } from "../../../services/region-normalizer";
import { normalizeAlbamon } from "../normalize";
import type { AlbamonListing } from "../types";
import { collectAlbamonListingPages } from "./albamon-listing-browser";
import { buildAlbamonListingUrl } from "./albamon-url-policy";
import type { AlbamonCandidateSelection, AlbamonCollectionDependencies, AlbamonCollectionOptions, AlbamonCollectionResult, AlbamonListingPageResult, AlbamonSelectedCandidate } from "./albamon-collection-types";
import type { JobKoreaCollectionProgress } from "../../jobkorea/collection/jobkorea-collection-types";

export function selectAlbamonCandidates(pageResults: AlbamonListingPageResult[], maximum: number, requestedRegions: AlbamonCollectionOptions["requestedRegions"]): AlbamonCandidateSelection {
  const seen = new Set<string>(); const matching: AlbamonSelectedCandidate[] = [];
  let seoulMatches = 0, gyeonggiMatches = 0, multipleRegionMatches = 0, unknownRegionCandidates = 0, excludedByRegion = 0;
  for (const page of [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const candidate of [...page.candidates].sort((a, b) => a.firstSourcePosition - b.firstSourcePosition)) {
      if (seen.has(candidate.sourcePostingId)) continue; seen.add(candidate.sourcePostingId);
      const region = normalizeRegionText(candidate.regionText);
      if (region.regions.includes("seoul")) seoulMatches += 1;
      if (region.regions.includes("gyeonggi")) gyeonggiMatches += 1;
      if (region.regions.length > 1) multipleRegionMatches += 1;
      if (!region.regions.length) unknownRegionCandidates += 1;
      if (!matchesCollectionRegions(region, requestedRegions)) { excludedByRegion += 1; continue; }
      matching.push({ ...candidate, pageNumber: page.pageNumber, normalizedRegions: region.regions, regionConfidence: region.confidence });
    }
  }
  return { candidates: matching.slice(0, maximum), uniquePostingIds: seen.size, seoulMatches, gyeonggiMatches, multipleRegionMatches, unknownRegionCandidates, excludedByRegion };
}

function recordFor(candidate: AlbamonSelectedCandidate, options: AlbamonCollectionOptions, observedAt: string): IngestionRecord | null {
  if (!candidate.title.trim() || !candidate.companyName.trim()) return null;
  const listing: AlbamonListing = { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.canonicalUrl, title: candidate.title.trim(), companyName: candidate.companyName.trim(),
    salaryText: candidate.salaryText, regionText: candidate.regionText, workDaysText: candidate.workDaysText,
    workHoursText: candidate.workHoursText, employmentTypes: candidate.employmentTypes, deadlineText: candidate.deadlineText,
    promoted: null, capturedAt: observedAt };
  const job = { ...normalizeAlbamon(listing), categories: candidate.categoryLabels, postedAt: candidate.postingDate,
    postingStatus: "unknown" as const, collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
  if (validateCanonicalJob(job).length) return null;
  return { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation", mapPosition: null,
    sourceFixtureReference: `bounded_listing_collection:${options.presetId}:listing_playwright:${candidate.pageNumber}:${candidate.firstSourcePosition}:${candidate.observedLinkCount}:${candidate.sourcePostingId}`,
    permissionStatus: "unverified", listingUrl: buildAlbamonListingUrl(candidate.pageNumber), detailUrl: null, observedAt,
    sanitizerVersion: "albamon-listing-card-v1", parserVersion: "albamon-listing-card-v1", observationKind: "bounded_listing_collection",
    observationTransport: "playwright", pageNumber: candidate.pageNumber, listingPosition: candidate.firstSourcePosition,
    collectionPresetId: options.presetId, collectionPresetLabel: options.presetLabel, collectionKeyword: "오늘 등록",
    requestedRegions: options.requestedRegions, normalizedRegions: candidate.normalizedRegions, regionConfidence: candidate.regionConfidence,
    detailAccessStatus: "not_attempted", observedLinkCount: candidate.observedLinkCount } };
}

export async function collectAlbamonOnce(options: AlbamonCollectionOptions, dependencies: AlbamonCollectionDependencies): Promise<AlbamonCollectionResult> {
  const started = performance.now(); const now = dependencies.now ?? (() => new Date());
  const progress: JobKoreaCollectionProgress = { status: "preparing", message: "알바몬 수집 준비 중", listingPagesRequested: options.pages,
    listingPagesCompleted: 0, numericLinksExtracted: 0, uniquePostingIds: 0, regionMatchingCandidates: 0, selectedCandidates: 0,
    detailAttemptsCompleted: 0, detailAttemptsTotal: 0, successfulDetailParses: 0, listingFallbacks: 0, failedRecords: 0,
    predictedInserts: 0, predictedUpdates: 0, predictedUnchanged: 0, actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0 };
  const emit = (patch: Partial<JobKoreaCollectionProgress>) => { Object.assign(progress, patch); try { dependencies.onProgress?.({ ...progress }); } catch { /* observer isolation */ } };
  let runId: string | null = null; const runs = new IngestionRunRepository(dependencies.database); const jobs = new JobRepository(dependencies.database);
  if (options.mode === "write") runId = runs.begin("albamon", "albamon_listing_collection", options.maxDetails, { permissionStatus: "unverified",
    listingUrl: buildAlbamonListingUrl(1), maxDetails: options.maxDetails, contentRequestLimit: options.pages, preflightRequestLimit: 0,
    dryRun: false, selectedTransport: "playwright", searchPageCount: options.pages });
  try {
    emit({ status: "collecting_listings", message: `알바몬 목록 0/${options.pages} 페이지 수집 중` });
    const pageResults = await (dependencies.collectPages ?? collectAlbamonListingPages)(options.pages);
    const completed = pageResults.filter((page) => page.classification !== "transport_failed").length;
    const numericLinks = pageResults.reduce((sum, page) => sum + page.extractedNumericLinkCount, 0);
    emit({ status: "filtering_regions", message: "서울·경기 후보 선별 중", listingPagesCompleted: completed, numericLinksExtracted: numericLinks });
    const selection = selectAlbamonCandidates(pageResults, options.maxDetails, options.requestedRegions);
    const observedAt = now().toISOString(); const records = selection.candidates.map((candidate) => recordFor(candidate, options, observedAt)).filter((record): record is IngestionRecord => Boolean(record));
    const invalid = selection.candidates.length - records.length;
    const previews = records.map((record) => jobs.previewUpsert(record.job, record.metadata).action);
    const predictedInserts = previews.filter((value) => value === "inserted").length;
    const predictedUpdates = previews.filter((value) => value === "updated").length;
    const predictedUnchanged = previews.filter((value) => value === "unchanged").length;
    const predictedLowerCompletenessSkips = previews.filter((value) => value === "skipped").length;
    emit({ status: "predicting_changes", message: "목록 정보 변경 예상 계산 중", uniquePostingIds: selection.uniquePostingIds,
      regionMatchingCandidates: selection.uniquePostingIds - selection.excludedByRegion, selectedCandidates: selection.candidates.length,
      listingFallbacks: records.length, failedRecords: invalid, predictedInserts, predictedUpdates, predictedUnchanged, lowerCompletenessSkips: predictedLowerCompletenessSkips });
    let actualInserts = 0, actualUpdates = 0, actualUnchanged = 0, actualLowerCompletenessSkips = 0;
    if (options.mode === "write" && runId) {
      emit({ status: "writing_database", message: "알바몬 목록 정보를 SQLite에 반영 중" });
      const completion: TransportRunCompletion = { preflightRequests: 0, contentRequests: pageResults.length, selectedDetailCount: selection.candidates.length,
        blockedCount: pageResults.filter((page) => page.blocked).length, browserNavigations: pageResults.length, detailNavigations: 0, directRequests: 0 };
      const ingested = new IngestionService(dependencies.database).ingest(records, { source: "albamon", ingestionType: "albamon_listing_collection" },
        { runId, initial: { failed: invalid }, transportCompletion: completion });
      actualInserts = ingested.inserted; actualUpdates = ingested.updated; actualUnchanged = ingested.unchanged; actualLowerCompletenessSkips = ingested.skipped;
    }
    emit({ status: "completed", message: "알바몬 수집 완료", actualInserts, actualUpdates, actualUnchanged, lowerCompletenessSkips: options.mode === "write" ? actualLowerCompletenessSkips : predictedLowerCompletenessSkips });
    const blocked = pageResults.filter((page) => page.blocked).length; const transportFailures = pageResults.filter((page) => page.classification === "transport_failed").length;
    return { runId, mode: options.mode, status: blocked === pageResults.length && pageResults.length ? "blocked" : transportFailures || invalid ? "partial" : "completed",
      source: "albamon", presetId: options.presetId, presetLabel: options.presetLabel, keyword: "오늘 등록", requestedRegions: options.requestedRegions,
      pageResults, listingPagesRequested: options.pages, listingPagesCompleted: completed, numericLinksExtracted: numericLinks,
      uniquePostingIds: selection.uniquePostingIds, seoulMatches: selection.seoulMatches, gyeonggiMatches: selection.gyeonggiMatches,
      multipleRegionMatches: selection.multipleRegionMatches, unknownRegionCandidates: selection.unknownRegionCandidates, excludedByRegion: selection.excludedByRegion,
      candidatesSelected: selection.candidates.length, detailPagesAttempted: 0, successfullyParsed: 0, activeJobs: 0, expiredOrClosedJobs: 0,
      transportFailures, blockedDetails: 0, parseFailures: invalid, predictedInserts, predictedUpdates, predictedUnchanged,
      actualInserts, actualUpdates, actualUnchanged, listingOnlyRecords: records.length, failedRecords: invalid,
      predictedLowerCompletenessSkips, actualLowerCompletenessSkips, totalSqliteJobs: jobs.listAll().length, details: [], elapsedMs: Math.round(performance.now() - started) };
  } catch (error) {
    if (runId) runs.fail(runId, error instanceof Error ? error.message : "알바몬 수집 실패");
    throw error;
  }
}
