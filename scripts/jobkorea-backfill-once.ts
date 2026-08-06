import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { parseJobKoreaBackfillArgs } from "../src/sources/jobkorea/backfill/jobkorea-backfill-cli";
import { formatJobKoreaBackfillResult } from "../src/sources/jobkorea/backfill/jobkorea-backfill-output";
import { backfillJobKoreaListingsOnce } from "../src/sources/jobkorea/backfill/jobkorea-backfill-service";
import { JobKoreaTransportError } from "../src/sources/jobkorea/transport/jobkorea-error";

async function main(): Promise<void> {
  const options = parseJobKoreaBackfillArgs(process.argv.slice(2));
  console.log("JobKorea bounded listing-only backfill");
  console.log(`Preset: ${options.presetId} (${options.presetLabel})`);
  console.log(`Pages: ${options.pageFrom}-${options.pageTo}/10`);
  console.log(`Candidate cap: ${options.maxCandidates}/200`);
  console.log("Listing concurrency: 1; detail requests: 0; retries: 0");
  console.log(`Database writes: ${options.mode === "write" ? "enabled" : "disabled"}`);
  const database = options.mode === "write" ? openWritableDatabase(getDatabasePath()) : openReadonlyDatabase(getDatabasePath());
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) {
      throw new JobKoreaTransportError("JOBKOREA_MIGRATION_MISSING", `migration ${REQUIRED_MIGRATION_VERSION}이 필요합니다.`);
    }
    const result = await backfillJobKoreaListingsOnce(options, { database });
    for (const line of formatJobKoreaBackfillResult(result)) console.log(line);
    if (result.status !== "completed") process.exitCode = 1;
  } finally { database.close(); }
}

main().catch((error) => {
  const known = error instanceof JobKoreaTransportError ? error : new JobKoreaTransportError("JOBKOREA_BACKFILL_FAILED", "JobKorea listing backfill에 실패했습니다.", null, { cause: error });
  console.error(`[${known.code}] ${known.message}`); process.exitCode = 1;
});
