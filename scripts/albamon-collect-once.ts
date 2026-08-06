import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { collectAlbamonOnce } from "../src/sources/albamon/collection/albamon-collection-service";
import { parseAlbamonCollectionArgs } from "../src/sources/albamon/collection/albamon-collection-cli";

async function main(): Promise<void> {
  const options = parseAlbamonCollectionArgs(process.argv.slice(2));
  console.log(`알바몬 bounded 목록 수집: ${options.presetLabel}`);
  console.log(`목록 ${options.pages}페이지 · 후보 최대 ${options.maxDetails}건 · 상세 요청 0 · 재시도 0 · DB ${options.mode === "write" ? "쓰기" : "쓰기 없음"}`);
  console.log(`Exclusion keywords: ${options.exclusion?.keywords.join(", ") || "none"}`); console.log(`Exclusion fields: ${options.exclusion?.fields.join(", ") || "none"}`);
  const database = options.mode === "write" ? openWritableDatabase(getDatabasePath()) : openReadonlyDatabase(getDatabasePath());
  try {
    const result = await collectAlbamonOnce(options, { database });
    if (options.diagnostic) for (const page of result.pageResults) {
      const diagnostic = page.transportDiagnostic;
      console.log(`[ALBAMON_TRANSPORT] page=${page.pageNumber} requested=${page.requestedUrl} final=${diagnostic?.finalUrl ?? "unknown"}`);
      console.log(`[ALBAMON_TRANSPORT] status=${diagnostic?.httpStatus ?? "unknown"} category=${diagnostic?.failureCategory ?? "none"} error=${diagnostic?.errorName ?? "none"}: ${diagnostic?.errorMessage ?? "none"}`);
      console.log(`[ALBAMON_TRANSPORT] elapsedMs=${diagnostic?.navigationElapsedMs ?? "unknown"} browser=${diagnostic?.browserLaunchStatus ?? "unknown"} context=${diagnostic?.contextCreationStatus ?? "unknown"} page=${diagnostic?.pageCreationStatus ?? "unknown"}`);
      console.log(`[ALBAMON_TRANSPORT] dns=${diagnostic?.dnsFailure ?? false} tls=${diagnostic?.tlsFailure ?? false} timeout=${diagnostic?.timeoutFailure ?? false} crash=${diagnostic?.pageCrash ?? false}`);
      console.log(`[ALBAMON_TRANSPORT] redirects=${diagnostic?.redirectChain.map((hop) => `${hop.status ?? "unknown"}:${hop.host}${hop.path}`).join(" -> ") || "none"}`);
      console.log(`[ALBAMON_TRANSPORT] cleanup=page:${diagnostic?.pageCleanup ?? "unknown"},context:${diagnostic?.contextCleanup ?? "unknown"},browser:${diagnostic?.browserCleanup ?? "unknown"},server:${diagnostic?.serverCleanup ?? "unknown"}`);
    }
    console.log(`완료 페이지: ${result.listingPagesCompleted}/${result.listingPagesRequested}`);
    console.log(`숫자 링크: ${result.numericLinksExtracted} · 고유 ID: ${result.uniquePostingIds} · 선택: ${result.candidatesSelected}`);
    console.log(`유효 카드: ${result.validListingCards} · 무효 카드: ${result.invalidListingCards}`);
    console.log(`서울: ${result.seoulMatches} · 경기: ${result.gyeonggiMatches} · 지역 미확인: ${result.unknownRegionCandidates} · 지역 제외: ${result.excludedByRegion}`);
    console.log(`표시 위치: ${result.displayedLocationRecords} · source-filter 전용: ${result.sourceFilterOnlyRecords} · 지역 충돌: ${result.regionConflicts} · title/company 위치 오염 거절: ${result.titleLocationContaminationRejections}`);
    console.log(`Exclusion before/excluded/after: ${result.candidatesBeforeExclusion}/${result.candidatesExcluded}/${result.candidatesAfterExclusion}`);
    if (result.candidatesExcluded) {
      console.log(`Exclusion keywords: ${Object.entries(result.exclusionReasonCounts.byKeyword).map(([key, count]) => `${key}=${count}`).join(", ")}`);
      console.log(`Exclusion fields: ${Object.entries(result.exclusionReasonCounts.byField).map(([key, count]) => `${key}=${count}`).join(", ")}`);
      for (const sample of result.excludedCandidateSamples) console.log(`- excluded ${sample.postingId}: ${sample.matchedKeyword}/${sample.matchedField} page=${sample.listingPage} position=${sample.sourcePosition}`);
    }
    console.log(`목록 정보: ${result.listingOnlyRecords} · 실패: ${result.failedRecords}`);
    console.log(`예상 삽입/갱신/동일: ${result.predictedInserts}/${result.predictedUpdates}/${result.predictedUnchanged}`);
    console.log(`실제 삽입/갱신/동일: ${result.actualInserts}/${result.actualUpdates}/${result.actualUnchanged}`);
  } finally { database.close(); }
}
main().catch((error) => { console.error(`[ALBAMON_COLLECTION_FAILED] ${error instanceof Error ? error.message : "수집 실패"}`); process.exitCode = 1; });
