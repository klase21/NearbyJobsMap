import type { JobKoreaSearchOneShotResult, JobKoreaSearchOptions } from "./jobkorea-search-types";

const measured = (value: number | null): string => value === null ? "unknown" : String(value);

export function formatJobKoreaSearchResult(result: JobKoreaSearchOneShotResult, options: JobKoreaSearchOptions): string[] {
  const lines = [
    "잡코리아 bounded 검색 전송 결과",
    `실행 상태: ${result.status}`,
    `사용 transport: ${result.transportUsed}`,
    `권한 상태: ${result.permissionStatus === "blocked" ? "차단" : "미확인"}`,
    `robots 요청: ${result.robotsRequests}/1`,
    `검색 navigation: ${result.searchNavigations}/${options.pages}`,
    `상세 navigation: ${result.detailNavigations}/${options.maxDetails}`,
    `direct 요청: ${result.directRequests}/1`,
  ];
  for (const page of result.pageResults) {
    lines.push(`page=${page.pageNumber} classification=${page.classification} extracted=${measured(page.extractedCount)} ordinary=${measured(page.ordinaryPostingCount)} promoted=${measured(page.promotedPostingCount)} rejected=${measured(page.rejectedCandidateCount)} within_page_duplicates=${measured(page.duplicateWithinPageCount)} unique_new=${measured(page.uniqueNewCount)} valid_empty=${page.validEmptyPage}`);
    lines.push(`  snapshot_schema=${page.snapshotSchemaVersion ?? "unknown"} bytes=${measured(page.serializedSnapshotBytes)} ready_state=${page.documentReadyState ?? "unknown"} final_url=${page.finalUrl ?? "unknown"} page_title=${page.pageTitle ?? "unknown"}`);
    lines.push(`  readiness=${page.readinessReason ?? "unknown"} readiness_numeric=${measured(page.readinessNumericDetailLinkCount)} snapshot_numeric=${measured(page.extractedCount)} readiness_ordinary_containers=${measured(page.readinessOrdinaryContainerCount)} dom_changed=${page.domChangedAfterReadiness ?? "unknown"}`);
    lines.push(`  timing classification_ms=${page.classificationDurationMs ?? "unknown"} extraction_ms=${page.extractionDurationMs ?? "unknown"}`);
    if (page.evidence) lines.push(`  containers ordinary=${measured(page.evidence.ordinaryContainerCount)} rows=${measured(page.evidence.ordinaryRowCount)} roots=${measured(page.evidence.resultRootCount)} tables=${measured(page.evidence.knownTableResultCount)}/${measured(page.evidence.numericLinksInsideKnownTableResults)} lists=${measured(page.evidence.knownListResultCount)}/${measured(page.evidence.numericLinksInsideKnownListResults)} cards=${measured(page.evidence.knownCardResultCount)}/${measured(page.evidence.numericLinksInsideKnownCardResults)} promoted=${measured(page.evidence.promotedContainerCount)} recommendation=${measured(page.evidence.recommendationContainerCount)} recent=${measured(page.evidence.recentViewContainerCount)} inside_roots=${measured(page.evidence.numericLinksInsideKnownResultRoots)} outside_roots=${measured(page.evidence.numericLinksOutsideKnownResultRoots)}`);
    lines.push(`  first_ids=${page.candidates.length ? page.candidates.slice(0, 3).map(({ sourcePostingId }) => sourcePostingId).join(",") : page.extractedCount === null ? "unknown" : "none"}`);
    if (options.diagnostic && page.rejectionReasonCounts && Object.keys(page.rejectionReasonCounts).length) {
      lines.push("  rejected reasons:");
      for (const [reason, count] of Object.entries(page.rejectionReasonCounts)) lines.push(`  - ${reason}: ${count}`);
    }
    if (options.diagnostic && page.promotionSignalCounts && Object.keys(page.promotionSignalCounts).length) {
      lines.push("  promoted signals:");
      for (const [signal, count] of Object.entries(page.promotionSignalCounts)) lines.push(`  - ${signal}: ${count}`);
    }
    if (options.diagnostic && page.containerSignatures?.length) {
      lines.push("  dominant container signatures:");
      for (const item of page.containerSignatures) {
        const signature = item.signature;
        const classes = signature.classes.length ? signature.classes.join(",") : "none";
        const data = Object.keys(signature.dataAttributes).length
          ? Object.entries(signature.dataAttributes).map(([key, value]) => `${key}=${value}`).join(",") : "none";
        const ids = item.samplePostingIds.length ? item.samplePostingIds.join(",") : "none";
        lines.push(`  - ${item.signatureKey}: count=${item.count} tag=${signature.tag} classes=${classes} role=${signature.role ?? "none"} data=${data} depth=${signature.depthFromAnchor} numeric_links=${signature.numericDetailLinkCount} ordinary=${item.candidateClassifications.ordinary} promoted=${item.candidateClassifications.promoted} rejected=${item.candidateClassifications.rejected} sample_ids=${ids}`);
      }
    }
    if (options.diagnostic && page.shadowStructure) {
      const shadow = page.shadowStructure;
      lines.push("  JobKorea provisional ordinary structure:");
      lines.push(`  - provisional_groups=${shadow.provisionalPostingGroupCount} eligible=${shadow.structurallyEligibleGroupCount} rejected=${shadow.structurallyRejectedGroupCount} grouped_links=${shadow.totalGroupedNumericLinkCount} ungrouped_links=${shadow.ungroupedNumericLinkCount}`);
      lines.push(`  - verified_agreement=${shadow.verifiedOrdinaryAlsoStructurallyEligible} eligible_unverified=${shadow.structurallyEligibleButUnverified} verified_mismatch=${shadow.verifiedOrdinaryStructuralMismatch}`);
      if (Object.keys(shadow.structuralGroupRejectionReasonCounts).length) {
        lines.push(`  - structural_rejections=${Object.entries(shadow.structuralGroupRejectionReasonCounts).map(([reason, count]) => `${reason}:${count}`).join(" ")}`);
      }
      for (const item of shadow.structuralGroupSignatureSummaries) {
        lines.push(`  - group_signature=${item.signatureKey} groups=${item.groupCount} eligible=${item.eligibleGroupCount} rejected=${item.rejectedGroupCount} links=${Object.entries(item.linkCountDistribution).map(([count, groups]) => `${count}x${groups}`).join(",")} sibling_max=${item.siblingGroupCountMaximum} sample_ids=${item.samplePostingIds.join(",") || "none"}`);
      }
    }
  }
  lines.push(`선택=${result.selectedCandidates} 전역중복=${result.globalDuplicateCount} 삽입=${result.inserted} 갱신=${result.updated} 변경없음=${result.unchanged} 실패=${result.failed} 차단=${result.blocked}`);
  lines.push(`direct 검증: ${result.directVerification.classification} (${result.directVerification.diagnostic.code})`);
  lines.push(`source console errors: ${result.consoleErrors.length}`);
  lines.push(`failed resources: ${result.failedResources.totalCount} prevented_readiness_or_extraction=${result.failedResources.preventedReadinessOrExtraction ?? "unknown"}`);
  if (options.diagnostic && Object.keys(result.failedResources.typeCounts).length) {
    lines.push(`failed resource types: ${Object.entries(result.failedResources.typeCounts).map(([type, count]) => `${type}=${count}`).join(" ")}`);
  }
  if (options.diagnostic && result.failedResources.samples.length) {
    lines.push("failed resource samples:");
    for (const sample of result.failedResources.samples) lines.push(`- type=${sample.resourceType} host=${sample.hostCategory} code=${sample.failureCode} navigation_critical=${sample.navigationCritical}`);
  }
  for (const detail of result.details) lines.push(`- ${detail.sourcePostingId ?? "unknown"} result=${detail.result} diagnostics=${detail.diagnosticCodes.join(",") || "none"}`);
  lines.push(`Run ID: ${result.runId ?? "dry-run (DB 기록 없음)"}`);
  lines.push(`Elapsed: ${result.elapsedMs}ms / ${result.internalBudgetMs}ms`);
  if (options.diagnostic) {
    lines.push("Lifecycle diagnostics:");
    if (!result.lifecycleDiagnostics.length) lines.push("- browser lifecycle not started");
    for (const entry of result.lifecycleDiagnostics) lines.push(`- phase=${entry.phase} status=${entry.status} elapsed_ms=${entry.elapsedMs} code=${entry.code ?? "none"} message=${entry.message ?? "none"}`);
    for (const message of result.consoleErrors.slice(0, 5)) lines.push(`- source_error=${message.replace(/\s+/g, " ").slice(0, 500)}`);
  }
  return lines;
}
