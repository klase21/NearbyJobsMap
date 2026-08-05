import { getDatabasePath, openWritableDatabase } from "../src/db/connection";
import { getDatabaseStatus } from "../src/db/database-status";
import { applyMigrations } from "../src/db/migrate";
import { seedFictionalDemoJobs } from "../src/db/services/demo-seed-service";
import { ingestSanitizedFixtures } from "../src/db/services/fixture-ingestion-service";
import { printIngestion } from "./db-cli";

const path = getDatabasePath();
const database = openWritableDatabase(path);
try {
  const migration = applyMigrations(database);
  console.log(`database=${path}`);
  console.log(`migrations_applied=${migration.applied.join(",") || "none"}`);
  printIngestion("sanitized fixtures", ingestSanitizedFixtures(database));
  printIngestion("fictional demo", seedFictionalDemoJobs(database));
  const status = getDatabaseStatus(database, path);
  console.log(`jobs=${status.totalJobs} fixture_derived=${status.fixtureDerived} fictional=${status.fictional} jobkorea=${status.jobKorea} albamon=${status.albamon}`);
  console.log(`with_coordinates=${status.withCoordinates} without_coordinates=${status.withoutCoordinates}`);
} catch (error) {
  console.error(`local setup 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  database.close();
}
