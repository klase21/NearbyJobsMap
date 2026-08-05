import { getDatabasePath, openReadonlyDatabase } from "../src/db/connection";
import { getDatabaseStatus } from "../src/db/database-status";

const path = getDatabasePath();
try {
  const database = openReadonlyDatabase(path);
  try {
    const status = getDatabaseStatus(database, path);
    console.log(`database=${status.path}`);
    console.log(`migrations=${status.appliedMigrations.join(",") || "none"} pending=${status.pendingMigrations.join(",") || "none"}`);
    console.log(`jobs=${status.totalJobs} fixture_derived=${status.fixtureDerived} fictional=${status.fictional} one_shot_observed=${status.oneShotObserved}`);
    console.log(`jobkorea=${status.jobKorea} albamon=${status.albamon}`);
    console.log(`with_coordinates=${status.withCoordinates} without_coordinates=${status.withoutCoordinates}`);
    if (status.latestOneShotRun) console.log(`latest_one_shot_run=${status.latestOneShotRun.id} status=${status.latestOneShotRun.status} permission=${status.latestOneShotRun.permissionStatus ?? "n/a"} started=${status.latestOneShotRun.startedAt}`);
    for (const run of status.latestRuns) console.log(`run=${run.id} type=${run.ingestionType} status=${run.status} permission=${run.permissionStatus ?? "n/a"} inserted=${run.inserted} updated=${run.updated} unchanged=${run.unchanged} failed=${run.failed} started=${run.startedAt}`);
  } finally { database.close(); }
} catch (error) {
  console.error(`database status 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
