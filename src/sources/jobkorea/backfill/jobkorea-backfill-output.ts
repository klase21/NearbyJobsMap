import type { JobKoreaBackfillResult } from "./jobkorea-backfill-types";

const distribution = (value: Record<string, number>): string => Object.entries(value).map(([key, count]) => `${key}=${count}`).join(", ");

export function formatJobKoreaBackfillResult(result: JobKoreaBackfillResult): string[] {
  return [
    `상태: ${result.status} (${result.mode})`,
    `실행 ID: ${result.runId ?? "dry-run"}`,
    `목록 페이지: ${result.pagesCompleted}/${result.pagesRequested}`,
    `페이지 분류: ${distribution(result.pageClassifications)}; legacy parser failure=${result.parserFailurePages}; unresolved=${result.unresolvedPageFailures}`,
    `링크/고유 ID/교차 페이지 중복: ${result.linksExtracted}/${result.uniquePostingIds}/${result.crossPageDuplicates}`,
    `유효/무효 카드: ${result.validCards}/${result.invalidCards}`,
    `지역: 서울=${result.seoulCandidates}, 경기=${result.gyeonggiCandidates}, 복수=${result.multipleRegionCandidates}, 미확인=${result.unknownRegionCandidates}, 기타=${result.otherRegionCandidates}`,
    `지역 제외/키워드 제외/위치 오염 거부: ${result.excludedByRegion}/${result.excludedByKeyword}/${result.locationContaminationRejected}`,
    `선택 후보: ${result.selectedCandidates}`,
    `예측: insert=${result.predictedInserts}, update=${result.predictedUpdates}, unchanged=${result.predictedUnchanged}, skip=${result.predictedSkips}, observations=${result.predictedObservations}, changes=${result.predictedChangeEvents}`,
    `실제: insert=${result.actualInserts}, update=${result.actualUpdates}, unchanged=${result.actualUnchanged}, skip=${result.actualSkips}, failed=${result.failedItems}`,
    `관찰/변경 이벤트: ${result.observationsAdded}/${result.changeEventsAdded}`,
    `주소 품질: ${distribution(result.qualityAfter.address)}`,
    `급여 품질: ${distribution(result.qualityAfter.salary)}`,
    `좌표/통근 준비: ${result.qualityAfter.coordinateCoverage}/${result.qualityAfter.commuteReady}`,
    `상세 요청/브라우저 상세/retry: ${result.detailRequests}/${result.browserDetailNavigations}/${result.retries}`,
    `경과 시간: ${result.elapsedMs}ms`,
  ];
}
