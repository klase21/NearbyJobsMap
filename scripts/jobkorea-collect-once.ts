import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { parseJobKoreaCollectionArgs } from "../src/sources/jobkorea/collection/jobkorea-collection-cli";
import { formatJobKoreaCollectionResult } from "../src/sources/jobkorea/collection/jobkorea-collection-output";
import { collectJobKoreaOnce, JOBKOREA_COLLECTION_DETAIL_CONCURRENCY } from "../src/sources/jobkorea/collection/jobkorea-collection-service";
import { JobKoreaTransportError } from "../src/sources/jobkorea/transport/jobkorea-error";

async function main(): Promise<void> {
  const options = parseJobKoreaCollectionArgs(process.argv.slice(2));
  console.log("잡코리아 수동 bounded 수집 사전 요약");
  console.log(`Search URL: ${options.searchUrl}`); console.log(`Listing pages: ${options.pages}/3`);
  console.log(`Detail pages: ${options.maxDetails}/30`); console.log(`Detail concurrency: ${JOBKOREA_COLLECTION_DETAIL_CONCURRENCY}/2`);
  console.log("Retries/direct endpoint/cookies/login/profile/stealth: disabled"); console.log(`Database writes: ${options.mode === "write" ? "enabled" : "disabled"}`);
  console.log(`Listing fallback: ${options.allowListingFallback ? "enabled" : "disabled"}`);
  const database = options.mode === "write" ? openWritableDatabase(getDatabasePath()) : openReadonlyDatabase(getDatabasePath());
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new JobKoreaTransportError("JOBKOREA_MIGRATION_MISSING", `migration ${REQUIRED_MIGRATION_VERSION}이 필요합니다.`);
    const result = await collectJobKoreaOnce(options, { database });
    console.log(""); for (const line of formatJobKoreaCollectionResult(result)) console.log(line);
    if (result.status === "failed" || result.status === "blocked") process.exitCode = 1;
  } finally { database.close(); }
}

main().catch((error) => { const known = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_COLLECTION_FAILED", "잡코리아 수동 수집이 실패했습니다.", null, { cause: error }); console.error(`[${known.code}] ${known.message}`); process.exitCode = 1; });
