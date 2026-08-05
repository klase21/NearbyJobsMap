import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { parseJobKoreaCliArgs } from "../src/sources/jobkorea/transport/jobkorea-cli-args";
import { JobKoreaTransportError } from "../src/sources/jobkorea/transport/jobkorea-error";
import { getJobKoreaContentRequestLimit } from "../src/sources/jobkorea/transport/jobkorea-request-budget";
import { runJobKoreaOneShot } from "../src/sources/jobkorea/transport/jobkorea-one-shot-transport";

async function main(): Promise<void> {
  const options = parseJobKoreaCliArgs(process.argv.slice(2));
  console.log("잡코리아 원샷 전송 사전 요약");
  console.log(`Source: 잡코리아`);
  console.log(`Listing URL: ${options.listingUrl}`);
  console.log(`Maximum detail pages: ${options.maxDetails}`);
  console.log(`Maximum content requests: ${getJobKoreaContentRequestLimit(options.maxDetails)}`);
  console.log("Robots preflight requests: 최대 1 (콘텐츠 예산과 별도)");
  console.log("Cookies: disabled");
  console.log("Retries: disabled");
  console.log("Pagination: disabled");
  console.log(`Database writes: ${options.dryRun ? "disabled" : "enabled"}`);
  const path = getDatabasePath();
  const database = options.dryRun ? openReadonlyDatabase(path) : openWritableDatabase(path);
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new JobKoreaTransportError("JOBKOREA_MIGRATION_MISSING", `migration ${REQUIRED_MIGRATION_VERSION}이 필요합니다.`);
    const result = await runJobKoreaOneShot(options, { database });
    console.log("\n잡코리아 원샷 전송 결과");
    console.log(`실행 상태: ${result.status}`);
    console.log(`권한 상태: ${result.permissionStatus === "blocked" ? "차단" : "미확인"}`);
    console.log(`목록 요청: ${result.listingRequests}/1`);
    console.log(`상세 요청: ${result.detailRequests}/${options.maxDetails}`);
    console.log(`총 콘텐츠 HTTP 요청: ${result.contentRequests}/${getJobKoreaContentRequestLimit(options.maxDetails)}`);
    console.log(`사전확인 요청: ${result.preflightRequests}/1`);
    console.log(`목록 후보: ${result.listingCandidates} 선택: ${result.selectedCandidates} 거부: ${result.rejectedCandidates}`);
    console.log(`삽입: ${result.inserted} 갱신: ${result.updated} 변경 없음: ${result.unchanged} 건너뜀: ${result.skipped} 실패: ${result.failed} 차단: ${result.blocked}`);
    console.log(`Run ID: ${result.runId ?? "dry-run (DB 기록 없음)"}`);
    for (const detail of result.details) console.log(`- ${detail.sourcePostingId ?? "unknown"} ${detail.url} result=${detail.result} diagnostics=${detail.diagnosticCodes.join(",") || "none"}`);
    for (const entry of result.diagnostics) console.log(`[${entry.code}] ${entry.message}`);
    if (result.status === "failed" || result.status === "blocked") process.exitCode = 1;
  } finally { database.close(); }
}

main().catch((error) => {
  const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_COMMAND_FAILED", "원샷 전송 명령이 실패했습니다.", null, { cause: error });
  console.error(`[${transport.code}] ${transport.message}`);
  process.exitCode = 1;
});
