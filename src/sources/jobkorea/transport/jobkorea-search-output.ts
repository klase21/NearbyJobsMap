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
    lines.push(`  snapshot_schema=${page.snapshotSchemaVersion ?? "unknown"} final_url=${page.finalUrl ?? "unknown"} page_title=${page.pageTitle ?? "unknown"}`);
    lines.push(`  first_ids=${page.candidates.length ? page.candidates.slice(0, 3).map(({ sourcePostingId }) => sourcePostingId).join(",") : page.extractedCount === null ? "unknown" : "none"}`);
  }
  lines.push(`선택=${result.selectedCandidates} 전역중복=${result.globalDuplicateCount} 삽입=${result.inserted} 갱신=${result.updated} 변경없음=${result.unchanged} 실패=${result.failed} 차단=${result.blocked}`);
  lines.push(`direct 검증: ${result.directVerification.classification} (${result.directVerification.diagnostic.code})`);
  lines.push(`source console errors: ${result.consoleErrors.length}`);
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
