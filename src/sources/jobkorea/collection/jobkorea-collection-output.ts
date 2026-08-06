import type { JobKoreaCollectionResult } from "./jobkorea-collection-types";

export function formatJobKoreaCollectionResult(result: JobKoreaCollectionResult): string[] {
  const lines = ["잡코리아 수동 수집 결과", "", `상태: ${result.status}`, `모드: ${result.mode}`,
    `Preset: ${result.presetId ?? "explicit-url"}${result.presetLabel ? ` (${result.presetLabel})` : ""}`, `Keyword: ${result.keyword || "(없음)"}`,
    `요청 지역: ${result.requestedRegions.length ? result.requestedRegions.join(", ") : "전체"}`,
    `목록 페이지: ${result.listingPagesCompleted}/${result.listingPagesRequested}`, `숫자 링크: ${result.numericLinksExtracted}`,
    `고유 posting ID (지역 필터 전): ${result.uniquePostingIds}`, `서울/경기/복수/미확인: ${result.seoulMatches}/${result.gyeonggiMatches}/${result.multipleRegionMatches}/${result.unknownRegionCandidates}`,
    `지역 제외/선택 후보: ${result.excludedByRegion}/${result.candidatesSelected}`,
    `상세 시도: ${result.detailPagesAttempted}`, `파싱 성공: ${result.successfullyParsed}`,
    `활성: ${result.activeJobs}`, `만료/마감: ${result.expiredOrClosedJobs}`, `전송 실패: ${result.transportFailures}`,
    `차단 상세: ${result.blockedDetails}`, `파싱 실패: ${result.parseFailures}`,
    `예상 insert/update/unchanged: ${result.predictedInserts}/${result.predictedUpdates}/${result.predictedUnchanged}`,
    `실제 insert/update/unchanged: ${result.actualInserts}/${result.actualUpdates}/${result.actualUnchanged}`,
    `목록 정보/저장 실패/낮은 완성도 skip: ${result.listingOnlyRecords}/${result.failedRecords}/${result.actualLowerCompletenessSkips}`,
    `SQLite 총 공고: ${result.totalSqliteJobs}`, `경과: ${result.elapsedMs}ms`, `Run ID: ${result.runId ?? "dry-run (기록 없음)"}`];
  if (result.excludedRegionSamples.length) lines.push("지역 제외 sample", ...result.excludedRegionSamples.map((sample) => `- ${sample.sourcePostingId}: ${sample.reason} (${sample.normalizedRegions.join(",") || "unknown"})`));
  lines.push("", "상세 결과");
  for (const item of result.details) {
    const redirectPath = item.redirectChain.length ? ` · redirects ${item.redirectChain.map(({ status, host, path }) => `${status}:${host}${path}`).join(" → ")}` : "";
    lines.push(`- ${item.sourcePostingId}: ${item.status} · transport=${item.transport} · completeness=${item.dataCompleteness} · HTTP=${item.httpStatus ?? "n/a"} · redirect=${item.redirectClassification}/${item.redirectCount ?? "n/a"} · parser=${item.parserResult} · canonical=${item.canonicalValidation} · DB=${item.databaseAction}`);
    lines.push(`  requested=${item.requestedUrl} · final=${item.finalUrl ?? "unknown"}${redirectPath}${item.diagnosticCodes.length ? ` · diagnostics=${item.diagnosticCodes.join(",")}` : ""}`);
  }
  return lines;
}
