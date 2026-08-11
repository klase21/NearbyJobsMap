import { validateCanonicalJob } from "../../../db/job-validation";
import { IngestionRunRepository } from "../../../db/repositories/ingestion-run-repository";
import { JobRepository } from "../../../db/repositories/job-repository";
import { IngestionService } from "../../../db/services/ingestion-service";
import type { IngestionRecord, TransportRunCompletion } from "../../../db/schema";
import { matchesCollectionRegions, normalizeRegionText } from "../../../services/region-normalizer";
import { normalizeAlbamon } from "../normalize";
import type { AlbamonListing } from "../types";
import { collectAlbamonListingPages } from "./albamon-listing-browser";
import { buildAlbamonHistoricalListingUrl, buildAlbamonListingUrl } from "./albamon-url-policy";
import type { AlbamonCandidateSelection, AlbamonCollectionDependencies, AlbamonCollectionOptions, AlbamonCollectionResult, AlbamonListingPageResult, AlbamonSelectedCandidate } from "./albamon-collection-types";
import type { JobKoreaCollectionProgress } from "../../jobkorea/collection/jobkorea-collection-types";
import { applyCandidateExclusions, MAX_IMPORTED_EXCLUSION_KEYWORDS, normalizeCollectionExclusionConfig, normalizeImportedCollectionExclusionConfig } from "../../../services/collection-exclusion";
import { exclusionConfigurationHash } from "../../../services/collection-exclusion-hash.server";
import { resolveAlbamonRegionFilter } from "./albamon-region-evidence";
import { classifyPostingDateEvidence, koreaCalendarDate, resolvePostingDateAtCutoff } from "../../../services/collection-date";

export function selectAlbamonCandidates(pageResults: AlbamonListingPageResult[], maximum: number, requestedRegions: AlbamonCollectionOptions["requestedRegions"], exclusionInput = normalizeCollectionExclusionConfig(), importedProfile = false): AlbamonCandidateSelection {
  const seen = new Set<string>(); const matching: AlbamonSelectedCandidate[] = [];
  let seoulMatches = 0, gyeonggiMatches = 0, multipleRegionMatches = 0, capitalScopeMatches = 0, unknownRegionCandidates = 0, excludedByRegion = 0;
  let displayedLocationRecords = 0, sourceFilterOnlyRecords = 0, regionConflicts = 0, titleLocationContaminationRejections = 0;
  for (const page of [...pageResults].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const candidate of [...page.candidates].sort((a, b) => a.firstSourcePosition - b.firstSourcePosition)) {
      if (seen.has(candidate.sourcePostingId)) continue; seen.add(candidate.sourcePostingId);
      const displayedArea = normalizeRegionText(candidate.regionText);
      const displayedAddress = normalizeRegionText(candidate.workplaceAddress);
      const areaCapitalRegions = displayedArea.regions.filter((value) => value === "seoul" || value === "gyeonggi");
      const addressCapitalRegions = displayedAddress.regions.filter((value) => value === "seoul" || value === "gyeonggi");
      const locationConflict = areaCapitalRegions.length === 1 && addressCapitalRegions.length === 1 && areaCapitalRegions[0] !== addressCapitalRegions[0];
      const displayed = locationConflict ? { originalText: candidate.regionText, regions: ["capital_scope" as const], confidence: "multiple" as const }
        : areaCapitalRegions.length ? displayedArea : addressCapitalRegions.length ? displayedAddress : displayedArea;
      if (candidate.regionText || candidate.workplaceAddress) displayedLocationRecords += 1;
      if (candidate.locationContaminationRejected) titleLocationContaminationRejections += 1;
      const sourceFilterRegions = page.sourceFilterRegions?.length ? page.sourceFilterRegions : page.sourceFilterRegion ? [page.sourceFilterRegion] : [];
      if (locationConflict) regionConflicts += 1;
      if (sourceFilterRegions.length === 1 && displayed.regions.length && displayed.regions.some((value) => value !== "capital_scope" && !sourceFilterRegions.includes(value as "seoul" | "gyeonggi"))) {
        regionConflicts += 1; excludedByRegion += 1; continue;
      }
      const sourceFilterOnlyRegions = sourceFilterRegions.length === 2 && page.sourceAreaCode === "I000,B000"
        ? ["capital_scope" as const] : sourceFilterRegions;
      const region = sourceFilterRegions.length && !displayed.regions.length
        ? { originalText: displayed.originalText, regions: sourceFilterOnlyRegions, confidence: "exact_source_filter" as const }
        : displayed;
      if (sourceFilterRegions.length && !areaCapitalRegions.length && !addressCapitalRegions.length) sourceFilterOnlyRecords += 1;
      if (region.regions.includes("seoul")) seoulMatches += 1;
      if (region.regions.includes("gyeonggi")) gyeonggiMatches += 1;
      if (region.regions.includes("capital_scope")) capitalScopeMatches += 1;
      if (region.regions.length > 1) multipleRegionMatches += 1;
      if (!region.regions.length) unknownRegionCandidates += 1;
      const matchesRequested = region.regions.includes("capital_scope")
        ? requestedRegions.includes("seoul") && requestedRegions.includes("gyeonggi")
        : matchesCollectionRegions(region, requestedRegions);
      if (!matchesRequested) { excludedByRegion += 1; continue; }
      const regionEvidenceSource = locationConflict || sourceFilterRegions.length && !displayed.regions.length ? "source_filter"
        : displayed.confidence === "mapped_city" ? "mapped_displayed_location"
          : displayed.regions.length ? "displayed_location" : "unknown";
      matching.push({ ...candidate, regionConflict: locationConflict, pageNumber: page.pageNumber, normalizedRegions: region.regions,
        regionConfidence: region.confidence, regionEvidenceSource, sourceAreaCode: page.sourceAreaCode ?? null });
    }
  }
  const exclusion = applyCandidateExclusions(matching, exclusionInput, (candidate) => ({ postingId: candidate.sourcePostingId,
    listingPage: candidate.pageNumber, sourcePosition: candidate.firstSourcePosition, title: candidate.title, company: candidate.companyName,
    location: candidate.regionText, categories: candidate.categoryLabels, employmentTypes: candidate.employmentTypes,
    workSchedule: [candidate.workDaysText, candidate.workHoursText].filter((value): value is string => Boolean(value)) }), importedProfile ? MAX_IMPORTED_EXCLUSION_KEYWORDS : undefined);
  return { candidates: exclusion.candidates.slice(0, maximum), uniquePostingIds: seen.size, seoulMatches, gyeonggiMatches,
    multipleRegionMatches, capitalScopeMatches, unknownRegionCandidates, excludedByRegion, displayedLocationRecords, sourceFilterOnlyRecords,
    regionConflicts, titleLocationContaminationRejections, exclusion: exclusion.summary };
}

export function buildAlbamonListingRecord(candidate: AlbamonSelectedCandidate, options: AlbamonCollectionOptions, observedAt: string): IngestionRecord | null {
  if (!candidate.title.trim() || !candidate.companyName.trim()) return null;
  const listing: AlbamonListing = { sourcePostingId: candidate.sourcePostingId, sourceUrl: candidate.canonicalUrl, title: candidate.title.trim(), companyName: candidate.companyName.trim(),
    salaryText: candidate.salaryText, regionText: candidate.regionText, workDaysText: candidate.workDaysText,
    workHoursText: candidate.workHoursText, employmentTypes: candidate.employmentTypes, deadlineText: candidate.deadlineText,
    promoted: null, capturedAt: observedAt, salaryFromStructured: candidate.salaryFromStructured === true,
    payType: candidate.payType ?? null, workplaceAddress: candidate.workplaceAddress ?? null,
    latitude: candidate.latitude ?? null, longitude: candidate.longitude ?? null, regionConflict: candidate.regionConflict === true };
  const sourcePostingDate = candidate.postingDateEvidence?.raw ?? candidate.postingDate;
  const sourceFilterToday = options.localTodayMode === true && options.collectionDate && candidate.sourceAreaCode !== null;
  const date = sourceFilterToday ? { evidence: "source_filter:searchPeriodType=TODAY", status: "today" as const,
    resolvedDate: options.collectionDate!.resolvedDate } : options.backfillCutoffDate ? resolvePostingDateAtCutoff(sourcePostingDate, observedAt, options.backfillCutoffDate)
      : options.collectionDate ? classifyPostingDateEvidence(sourcePostingDate, options.collectionDate.resolvedDate) : null;
  const job = { ...normalizeAlbamon(listing), categories: candidate.categoryLabels, postedAt: date?.resolvedDate ?? candidate.postingDate,
    postingStatus: "unknown" as const, collectedAt: observedAt, lastVerifiedAt: observedAt, rawPayloadReference: null };
  if (validateCanonicalJob(job).length) return null;
  const mapPosition = !candidate.regionConflict && job.latitude !== null && job.longitude !== null
    ? { latitude: job.latitude, longitude: job.longitude, kind: "exact" as const, provenance: "source" as const } : null;
  return { job, metadata: { recordKind: "live_one_shot_observation", evidenceType: "public_page_observation", mapPosition,
    sourceFixtureReference: `bounded_listing_collection:${options.presetId}:listing_playwright:${candidate.sourceAreaCode ?? "no-area"}:${candidate.pageNumber}:${candidate.firstSourcePosition}:${candidate.observedLinkCount}:${candidate.sourcePostingId}:location-conflict-${candidate.regionConflict ? 1 : 0}:pay-the-day-${candidate.payTheDay ? 1 : 0}`,
    permissionStatus: "unverified", listingUrl: options.backfillCutoffDate || options.personalProfileBackfill
      ? buildAlbamonHistoricalListingUrl(candidate.pageNumber, candidate.sourceAreaCode ?? "I000,B000", Math.max(options.pages, candidate.pageNumber), (options.personalProfileBackfill ? normalizeImportedCollectionExclusionConfig : normalizeCollectionExclusionConfig)(options.exclusion).keywords, options.historicalSortType)
      : buildAlbamonListingUrl(candidate.pageNumber, candidate.sourceAreaCode, options.localTodayMode ? 100 : 5), detailUrl: null, observedAt,
    sanitizerVersion: "albamon-listing-card-v2", parserVersion: "albamon-listing-card-v2", observationKind: "bounded_listing_collection",
    observationTransport: "playwright", pageNumber: candidate.pageNumber, listingPosition: candidate.firstSourcePosition,
    collectionPresetId: options.presetId, collectionPresetLabel: options.presetLabel, collectionKeyword: options.personalProfileBackfill ? "personal_profile:all" : options.backfillCutoffDate ? `backfill:${options.backfillCutoffDate}` : "오늘 등록",
    requestedRegions: options.requestedRegions, normalizedRegions: candidate.normalizedRegions, regionConfidence: candidate.regionConfidence,
    regionEvidenceSource: candidate.regionEvidenceSource, sourceAreaCode: candidate.sourceAreaCode,
    displayedLocationPresent: candidate.regionText !== null,
    detailAccessStatus: "not_attempted", observedLinkCount: candidate.observedLinkCount, postingDateEvidence: date?.evidence ?? sourcePostingDate,
    postingDateStatus: date?.status ?? "unknown", postingDateLocalDate: date?.resolvedDate ?? null } };
}

export async function collectAlbamonOnce(options: AlbamonCollectionOptions, dependencies: AlbamonCollectionDependencies): Promise<AlbamonCollectionResult> {
  const started = performance.now(); const now = dependencies.now ?? (() => new Date());
  const exclusionConfig = (options.personalProfileBackfill ? normalizeImportedCollectionExclusionConfig : normalizeCollectionExclusionConfig)(options.exclusion);
  const historicalMode = Boolean(options.backfillCutoffDate || options.personalProfileBackfill);
  const progress: JobKoreaCollectionProgress = { status: "preparing", message: "알바몬 수집 준비 중", listingPagesRequested: options.pages,
    listingPagesCompleted: 0, numericLinksExtracted: 0, uniquePostingIds: 0, regionMatchingCandidates: 0, selectedCandidates: 0,
    candidatesBeforeExclusion: 0, candidatesExcluded: 0, candidatesAfterExclusion: 0,
    detailAttemptsCompleted: 0, detailAttemptsTotal: 0, successfulDetailParses: 0, listingFallbacks: 0, failedRecords: 0,
    predictedInserts: 0, predictedUpdates: 0, predictedUnchanged: 0, actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0 };
  const emit = (patch: Partial<JobKoreaCollectionProgress>) => { Object.assign(progress, patch); try { dependencies.onProgress?.({ ...progress }); } catch { /* observer isolation */ } };
  let runId: string | null = null; const runs = new IngestionRunRepository(dependencies.database); const jobs = new JobRepository(dependencies.database);
  const sourceFilter = resolveAlbamonRegionFilter(options.requestedRegions);
  if (options.mode === "write") runId = runs.begin("albamon", "albamon_listing_collection", options.maxDetails, { permissionStatus: "unverified",
    listingUrl: historicalMode ? buildAlbamonHistoricalListingUrl(1, sourceFilter?.areaCode ?? "I000,B000", options.pages, exclusionConfig.keywords, options.historicalSortType)
      : buildAlbamonListingUrl(1, sourceFilter?.areaCode ?? null, options.localTodayMode ? 100 : 5), maxDetails: options.maxDetails, contentRequestLimit: options.pages, preflightRequestLimit: 0,
    dryRun: false, selectedTransport: "playwright", searchPageCount: options.pages,
    exclusionKeywords: exclusionConfig.keywords, exclusionFields: exclusionConfig.fields, exclusionConfigHash: options.exclusionConfigHash ?? exclusionConfigurationHash(exclusionConfig, options.personalProfileBackfill === true),
    savedProfileId: options.savedProfile?.id ?? null, savedProfileName: options.savedProfile?.name ?? null, savedProfileRevision: options.savedProfile?.revision ?? null,
    savedProfileConfigurationHash: options.savedProfile?.configurationHash ?? null, collectionDateScope: options.collectionDate ? "today" : "all",
    collectionTimezone: options.collectionDate?.timezone ?? (options.backfillCutoffDate ? "Asia/Seoul" : null),
    collectionLocalDate: options.collectionDate?.resolvedDate ?? (options.backfillCutoffDate ? koreaCalendarDate(now()) : null),
    operationKind: historicalMode ? "manual_backfill" : "collection", cutoffDate: options.backfillCutoffDate ?? null });
  try {
    emit({ status: "collecting_listings", message: `알바몬 목록 0/${options.pages} 페이지 수집 중` });
    const pageResults = dependencies.collectPages
      ? await dependencies.collectPages(options.pages, { sourceFilterRegions: sourceFilter?.regions ?? [], localTodayMode: options.localTodayMode === true,
        historicalMode, ...(options.historicalSortType?{historicalSortType:options.historicalSortType}:{}), exclusionKeywords: exclusionConfig.keywords, ...(options.backfillCutoffDate?{cutoffDate:options.backfillCutoffDate}:{}),
        ...(options.signal?{signal:options.signal}:{}), ...(dependencies.onPage?{onPage:dependencies.onPage}:{}) })
      : await collectAlbamonListingPages(options.pages, { diagnostic: options.diagnostic === true, sourceFilterRegions: sourceFilter?.regions ?? [], localTodayMode: options.localTodayMode === true,
        historicalMode, ...(options.historicalSortType?{historicalSortType:options.historicalSortType}:{}), exclusionKeywords: exclusionConfig.keywords, ...(options.backfillCutoffDate?{cutoffDate:options.backfillCutoffDate}:{}),
        ...(options.signal?{signal:options.signal}:{}), ...(dependencies.onPage?{onPage:dependencies.onPage}:{}) });
    for (const page of pageResults) {
      page.sourceFilterRegion ??= sourceFilter?.regions.length === 1 ? sourceFilter.regions[0]! : null;
      page.sourceFilterRegions ??= sourceFilter?.regions ?? [];
      page.sourceAreaCode ??= sourceFilter?.areaCode ?? null;
    }
    if (runId && historicalMode) {
      const resolvedDates = options.backfillCutoffDate ? pageResults.flatMap((page) => page.candidates.map((candidate) =>
        resolvePostingDateAtCutoff(candidate.postingDateEvidence?.raw ?? candidate.postingDate, page.observedAt ?? now().toISOString(), options.backfillCutoffDate!).resolvedDate)
        .filter((value): value is string => Boolean(value))) : [];
      const last = pageResults.at(-1);
      const stopReason = last?.diagnosticCodes.includes("ALBAMON_BACKFILL_CUTOFF_REACHED") ? "cutoff_reached"
        : last?.diagnosticCodes.includes("ALBAMON_SOURCE_TOTAL_EXHAUSTED") ? "source_total_exhausted"
        : last?.validEmptyPage ? "empty_page" : last?.blocked ? "source_blocked" : last?.parserFailure ? "parser_failure"
          : pageResults.length >= options.pages ? "page_limit" : options.signal?.aborted ? "cancelled" : "source_failure";
      runs.updateBackfillSummary(runId, { pagesScanned: pageResults.length, stopReason,
        oldestPostingDate: resolvedDates.length ? [...resolvedDates].sort()[0]! : null });
    }
    const completed = pageResults.filter((page) => page.classification === "valid_results" || page.classification === "valid_empty").length;
    const numericLinks = pageResults.reduce((sum, page) => sum + page.extractedNumericLinkCount, 0);
    const validListingCards = pageResults.reduce((sum, page) => sum + page.candidates.length, 0);
    const invalidListingCards = pageResults.reduce((sum, page) => sum + (page.invalidCardCount ?? 0), 0);
    const observedUniquePostingIds = new Set(pageResults.flatMap((page) => page.candidates.map((candidate) => candidate.sourcePostingId))).size;
    const postingDateCounts = { today: 0, older: 0, unknown: 0, futureInvalid: 0 };
    const postingDateEvidenceExamples = [...new Set(pageResults.flatMap((page) => page.candidates
      .map((candidate) => candidate.postingDateEvidence?.raw).filter((value): value is string => Boolean(value))))].slice(0, 5);
    const sourceFilterToday = options.localTodayMode === true && options.collectionDate && sourceFilter !== null;
    if (options.collectionDate || options.backfillCutoffDate) for (const page of pageResults) page.candidates = page.candidates.filter((candidate) => {
      if (sourceFilterToday) { postingDateCounts.today += 1; return true; }
      const raw = candidate.postingDateEvidence?.raw ?? candidate.postingDate;
      const classification = options.backfillCutoffDate
        ? resolvePostingDateAtCutoff(raw, page.observedAt ?? now().toISOString(), options.backfillCutoffDate)
        : classifyPostingDateEvidence(raw, options.collectionDate!.resolvedDate);
      const status = classification.status;
      if (status === "today") postingDateCounts.today += 1; else if (status === "older") postingDateCounts.older += 1;
      else if (status === "future_invalid") postingDateCounts.futureInvalid += 1; else postingDateCounts.unknown += 1;
      return options.backfillCutoffDate ? "onOrAfterCutoff" in classification && classification.onOrAfterCutoff === true : status === "today";
    });
    emit({ status: "filtering_regions", message: "서울·경기 후보 선별 중", listingPagesCompleted: completed, numericLinksExtracted: numericLinks });
    const selection = selectAlbamonCandidates(pageResults, options.maxDetails, options.requestedRegions, exclusionConfig, options.personalProfileBackfill === true);
    if (runId) runs.updateTodaySummary(runId, postingDateCounts, pageResults.filter((page) => !["valid_results", "valid_empty"].includes(page.classification)).length);
    if (runId) runs.updateExclusionSummary(runId, selection.exclusion.candidatesExcluded, selection.candidates.length);
    emit({ status: "filtering_regions", message: `제외 키워드로 ${selection.exclusion.candidatesExcluded}건 제외`,
      candidatesBeforeExclusion: selection.exclusion.candidatesBeforeExclusion, candidatesExcluded: selection.exclusion.candidatesExcluded,
      candidatesAfterExclusion: selection.exclusion.candidatesAfterExclusion });
    const observedAt = now().toISOString(); const records = selection.candidates.map((candidate) => buildAlbamonListingRecord(candidate, options,
      pageResults.find((page) => page.pageNumber === candidate.pageNumber)?.observedAt ?? observedAt)).filter((record): record is IngestionRecord => Boolean(record));
    const invalid = selection.candidates.length - records.length;
    const workplaceAddressRecords = selection.candidates.filter((candidate) => Boolean(candidate.workplaceAddress?.trim())).length;
    const coordinatesAccepted = selection.candidates.filter((candidate) => !candidate.regionConflict && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)).length;
    const coordinatesSuppressedDueConflict = selection.candidates.filter((candidate) => candidate.regionConflict && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)).length;
    const salaryDisplayPresent = records.filter((record) => Boolean(record.job.salary.originalText.trim())).length;
    const salaryDisplayMissing = records.length - salaryDisplayPresent;
    const monthlyStructuredSalary = records.filter((record) => record.job.salary.type === "monthly" && record.job.salary.minimumAmount !== null).length;
    const hourlyStructuredSalary = records.filter((record) => record.job.salary.type === "hourly" && record.job.salary.minimumAmount !== null).length;
    const dailyStructuredSalary = records.filter((record) => record.job.salary.type === "daily" && record.job.salary.minimumAmount !== null).length;
    const structuredSalaryCount = monthlyStructuredSalary + hourlyStructuredSalary + dailyStructuredSalary;
    const validUnstructuredSalary = salaryDisplayPresent - structuredSalaryCount;
    const rejectedSalaryCandidates = selection.candidates.filter((candidate) => candidate.salaryCandidateRejected === true).length;
    const payTheDayRecords = selection.candidates.filter((candidate) => candidate.payTheDay === true).length;
    const payTheDaySalaryRecords = records.filter((record) => record.job.salary.originalText.trim() === "당일지급").length;
    const scheduleRecords = selection.candidates.filter((candidate) => Boolean(candidate.workPeriodText || candidate.workDaysText || candidate.workHoursText)).length;
    const deadlineRecords = selection.candidates.filter((candidate) => Boolean(candidate.deadlineText)).length;
    const employmentTypeRecords = selection.candidates.filter((candidate) => candidate.employmentTypes.length > 0).length;
    const todayPostingDateContradictions = sourceFilterToday ? pageResults.reduce((sum, page) => sum + page.candidates.filter((candidate) => {
      const status = classifyPostingDateEvidence(candidate.postingDateEvidence?.raw ?? candidate.postingDate, options.collectionDate!.resolvedDate).status;
      return status === "older" || status === "future_invalid";
    }).length, 0) : 0;
    const previews = records.map((record) => jobs.previewUpsert(record.job, record.metadata).action);
    const predictedInserts = previews.filter((value) => value === "inserted").length;
    const predictedUpdates = previews.filter((value) => value === "updated").length;
    const predictedUnchanged = previews.filter((value) => value === "unchanged").length;
    const predictedLowerCompletenessSkips = previews.filter((value) => value === "skipped").length;
    emit({ status: "predicting_changes", message: "목록 정보 변경 예상 계산 중", uniquePostingIds: selection.uniquePostingIds,
      regionMatchingCandidates: selection.uniquePostingIds - selection.excludedByRegion, selectedCandidates: selection.candidates.length,
      candidatesBeforeExclusion: selection.exclusion.candidatesBeforeExclusion, candidatesExcluded: selection.exclusion.candidatesExcluded,
      candidatesAfterExclusion: selection.exclusion.candidatesAfterExclusion,
      listingFallbacks: records.length, failedRecords: invalid, predictedInserts, predictedUpdates, predictedUnchanged, lowerCompletenessSkips: predictedLowerCompletenessSkips });
    let actualInserts = 0, actualUpdates = 0, actualUnchanged = 0, actualLowerCompletenessSkips = 0;
    if (options.mode === "write" && options.signal?.aborted) throw new Error("ALBAMON_BACKFILL_CANCELLED");
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
    const metadataExamples = selection.candidates.slice(0, 20).map((candidate) => ({
      sourcePostingId: candidate.sourcePostingId, regionText: candidate.regionText, workplaceAddress: candidate.workplaceAddress ?? null,
      normalizedRegions: candidate.normalizedRegions, regionConflict: candidate.regionConflict === true,
      salaryText: candidate.salaryText, payType: candidate.payType ?? null, payTheDay: candidate.payTheDay === true,
      coordinatesPresent: Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude),
      workPeriodText: candidate.workPeriodText ?? null, workDaysText: candidate.workDaysText, workHoursText: candidate.workHoursText,
      postingDate: candidate.postingDate, deadlineText: candidate.deadlineText,
    }));
    return { runId, mode: options.mode, status: blocked === pageResults.length && pageResults.length ? "blocked" : transportFailures || invalid ? "partial" : "completed",
      source: "albamon", presetId: options.presetId, presetLabel: options.presetLabel,
      keyword: options.personalProfileBackfill ? "내 검색조건 전체" : "오늘 등록", requestedRegions: options.requestedRegions,
      pageResults, listingPagesRequested: options.pages, listingPagesCompleted: completed, numericLinksExtracted: numericLinks,
      uniquePostingIds: selection.uniquePostingIds, observedUniquePostingIds, validListingCards, invalidListingCards,
      seoulMatches: selection.seoulMatches, gyeonggiMatches: selection.gyeonggiMatches,
      multipleRegionMatches: selection.multipleRegionMatches, capitalScopeMatches: selection.capitalScopeMatches,
      unknownRegionCandidates: selection.unknownRegionCandidates, excludedByRegion: selection.excludedByRegion,
      displayedLocationRecords: selection.displayedLocationRecords, sourceFilterOnlyRecords: selection.sourceFilterOnlyRecords,
      regionConflicts: selection.regionConflicts, titleLocationContaminationRejections: selection.titleLocationContaminationRejections,
      workplaceAddressRecords, coordinatesAccepted, coordinatesSuppressedDueConflict, salaryDisplayPresent, salaryDisplayMissing,
      monthlyStructuredSalary, hourlyStructuredSalary, dailyStructuredSalary, validUnstructuredSalary, rejectedSalaryCandidates,
      payTheDayRecords, payTheDaySalaryRecords, scheduleRecords, todayPostingDateContradictions, deadlineRecords, employmentTypeRecords,
      ...selection.exclusion,
      candidatesSelected: selection.candidates.length, detailPagesAttempted: 0, successfullyParsed: 0, activeJobs: 0, expiredOrClosedJobs: 0,
      transportFailures, blockedDetails: 0, parseFailures: invalid, predictedInserts, predictedUpdates, predictedUnchanged,
      actualInserts, actualUpdates, actualUnchanged, listingOnlyRecords: records.length, failedRecords: invalid,
      predictedLowerCompletenessSkips, actualLowerCompletenessSkips, totalSqliteJobs: jobs.listAll().length, details: [], elapsedMs: Math.round(performance.now() - started),
      postingDateCounts, postingDateEvidenceExamples, sourceFilterTodayEligible: sourceFilterToday ? postingDateCounts.today : 0,
      registeredMetadataRecords: pageResults.reduce((sum, page) => sum + page.candidates.filter((candidate) => Boolean(candidate.postingDateEvidence?.raw)).length, 0),
      sourceTotalCount: pageResults.find((page) => page.sourceTotalCount !== null && page.sourceTotalCount !== undefined)?.sourceTotalCount ?? null,
      metadataExamples };
  } catch (error) {
    if (runId) runs.fail(runId, error instanceof Error ? error.message : "알바몬 수집 실패");
    throw error;
  }
}
