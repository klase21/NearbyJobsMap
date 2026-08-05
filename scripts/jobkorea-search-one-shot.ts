import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { JobKoreaTransportError } from "../src/sources/jobkorea/transport/jobkorea-error";
import { JOBKOREA_PAGE1_COMMAND_BUDGET_MS } from "../src/sources/jobkorea/transport/jobkorea-lifecycle";
import { parseJobKoreaSearchCliArgs } from "../src/sources/jobkorea/transport/jobkorea-search-cli";
import { runJobKoreaSearchOneShot } from "../src/sources/jobkorea/transport/jobkorea-search-one-shot";
import { formatJobKoreaSearchResult } from "../src/sources/jobkorea/transport/jobkorea-search-output";

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
  console.log(`Internal page-1 command budget: ${JOBKOREA_PAGE1_COMMAND_BUDGET_MS}ms`);
  const database = options.dryRun ? openReadonlyDatabase(getDatabasePath()) : openWritableDatabase(getDatabasePath());
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new JobKoreaTransportError("JOBKOREA_MIGRATION_MISSING", `migration ${REQUIRED_MIGRATION_VERSION}이 필요합니다.`);
    const result = await runJobKoreaSearchOneShot(options, { database });
    console.log("");
    for (const line of formatJobKoreaSearchResult(result, options)) console.log(line);
    if (result.status === "failed" || result.status === "blocked") process.exitCode = 1;
  } finally { database.close(); }
}

main().catch((error) => {
  const transport = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_COMMAND_FAILED", "잡코리아 bounded 검색 명령이 실패했습니다.", null, { cause: error });
  console.error(`[${transport.code}] ${transport.message}`);
  process.exitCode = 1;
});
