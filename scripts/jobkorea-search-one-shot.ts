import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { JobKoreaTransportError } from "../src/sources/jobkorea/transport/jobkorea-error";
import { parseJobKoreaSearchCliArgs } from "../src/sources/jobkorea/transport/jobkorea-search-cli";
import { runJobKoreaSearchOneShot } from "../src/sources/jobkorea/transport/jobkorea-search-one-shot";

async function main(): Promise<void> {
  const options = parseJobKoreaSearchCliArgs(process.argv.slice(2));
  console.log("잡코리아 bounded 검색 전송 사전 요약");
  console.log(`Search URL: ${options.searchUrl}`);
  console.log(`Requested transport: ${options.transport}`);
  console.log(`Search pages: ${options.pages}/2`);
  console.log(`Detail pages: ${options.maxDetails}/3`);
  console.log("Robots requests: 최대 1");
  console.log("Direct _GI_List requests: 최대 1 (현재 익명 계약이 관찰된 경우만)");
  console.log("Cookies/profile/login/stealth/retries: disabled");
  console.log(`Database writes: ${options.dryRun ? "disabled" : "enabled"}`);
  const database = options.dryRun ? openReadonlyDatabase(getDatabasePath()) : openWritableDatabase(getDatabasePath());
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new JobKoreaTransportError("JOBKOREA_MIGRATION_MISSING", `migration ${REQUIRED_MIGRATION_VERSION}이 필요합니다.`);
    const result = await runJobKoreaSearchOneShot(options, { database });
    console.log("\n잡코리아 bounded 검색 전송 결과");
    console.log(`실행 상태: ${result.status}`);
    console.log(`사용 transport: ${result.transportUsed}`);
    console.log(`권한 상태: ${result.permissionStatus === "blocked" ? "차단" : "미확인"}`);
    console.log(`robots 요청: ${result.robotsRequests}/1`);
    console.log(`검색 navigation: ${result.searchNavigations}/${options.pages}`);
    console.log(`상세 navigation: ${result.detailNavigations}/${options.maxDetails}`);
    console.log(`direct 요청: ${result.directRequests}/1`);
    for (const page of result.pageResults) {
      console.log(`page=${page.pageNumber} classification=${page.classification} extracted=${page.extractedCount} ordinary=${page.ordinaryPostingCount} promoted=${page.promotedPostingCount} within_page_duplicates=${page.duplicateWithinPageCount} unique_new=${page.uniqueNewCount} valid_empty=${page.validEmptyPage}`);
      console.log(`  first_ids=${page.candidates.slice(0, 3).map(({ sourcePostingId }) => sourcePostingId).join(",") || "none"}`);
    }
    console.log(`선택=${result.selectedCandidates} 전역중복=${result.globalDuplicateCount} 삽입=${result.inserted} 갱신=${result.updated} 변경없음=${result.unchanged} 실패=${result.failed} 차단=${result.blocked}`);
    console.log(`direct 검증: ${result.directVerification.classification} (${result.directVerification.diagnostic.code})`);
    console.log(`source console errors: ${result.consoleErrors.length}`);
    for (const detail of result.details) console.log(`- ${detail.sourcePostingId ?? "unknown"} result=${detail.result} diagnostics=${detail.diagnosticCodes.join(",") || "none"}`);
    console.log(`Run ID: ${result.runId ?? "dry-run (DB 기록 없음)"}`);
    if (result.status === "failed" || result.status === "blocked") process.exitCode = 1;
  } finally { database.close(); }
}

main().catch((error) => {
  const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_COMMAND_FAILED", "잡코리아 bounded 검색 명령이 실패했습니다.", null, { cause: error });
  console.error(`[${transport.code}] ${transport.message}`);
  process.exitCode = 1;
});
