import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { collectAlbamonOnce } from "../src/sources/albamon/collection/albamon-collection-service";
import { parseAlbamonCollectionArgs } from "../src/sources/albamon/collection/albamon-collection-cli";

async function main(): Promise<void> {
  const options = parseAlbamonCollectionArgs(process.argv.slice(2));
  console.log(`알바몬 bounded 목록 수집: ${options.presetLabel}`);
  console.log(`목록 ${options.pages}페이지 · 후보 최대 ${options.maxDetails}건 · 상세 요청 0 · 재시도 0 · DB ${options.mode === "write" ? "쓰기" : "쓰기 없음"}`);
  const database = options.mode === "write" ? openWritableDatabase(getDatabasePath()) : openReadonlyDatabase(getDatabasePath());
  try {
    const result = await collectAlbamonOnce(options, { database });
    console.log(`완료 페이지: ${result.listingPagesCompleted}/${result.listingPagesRequested}`);
    console.log(`숫자 링크: ${result.numericLinksExtracted} · 고유 ID: ${result.uniquePostingIds} · 선택: ${result.candidatesSelected}`);
    console.log(`서울: ${result.seoulMatches} · 경기: ${result.gyeonggiMatches} · 지역 미확인: ${result.unknownRegionCandidates} · 지역 제외: ${result.excludedByRegion}`);
    console.log(`목록 정보: ${result.listingOnlyRecords} · 실패: ${result.failedRecords}`);
    console.log(`예상 삽입/갱신/동일: ${result.predictedInserts}/${result.predictedUpdates}/${result.predictedUnchanged}`);
    console.log(`실제 삽입/갱신/동일: ${result.actualInserts}/${result.actualUpdates}/${result.actualUnchanged}`);
  } finally { database.close(); }
}
main().catch((error) => { console.error(`[ALBAMON_COLLECTION_FAILED] ${error instanceof Error ? error.message : "수집 실패"}`); process.exitCode = 1; });
