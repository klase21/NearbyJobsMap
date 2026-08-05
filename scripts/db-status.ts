import { getDatabasePath, openReadonlyDatabase } from "../src/db/connection";
import { getDatabaseStatus } from "../src/db/database-status";

const path = getDatabasePath();
try {
  const database = openReadonlyDatabase(path);
  try {
    const status = getDatabaseStatus(database, path);
    console.log(`database=${status.path}`);
    console.log(`migrations=${status.appliedMigrations.join(",") || "none"} pending=${status.pendingMigrations.join(",") || "none"}`);
    console.log(`jobs=${status.totalJobs} fixture_derived=${status.fixtureDerived} fictional=${status.fictional}`);
    console.log(`jobkorea=${status.jobKorea} albamon=${status.albamon}`);
    console.log(`with_coordinates=${status.withCoordinates} without_coordinates=${status.withoutCoordinates}`);
    for (const run of status.latestRuns) console.log(`run=${run.id} type=${run.ingestionType} status=${run.status} inserted=${run.inserted} updated=${run.updated} unchanged=${run.unchanged} failed=${run.failed} started=${run.startedAt}`);
  } finally { database.close(); }
} catch (error) {
  console.error(`database status 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
