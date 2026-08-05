import { getDatabasePath, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { seedFictionalDemoJobs } from "../src/db/services/demo-seed-service";
import { printIngestion } from "./db-cli";

const path = getDatabasePath();
const database = openWritableDatabase(path);
try {
  if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new Error("먼저 npm run db:migrate를 실행해 주세요.");
  printIngestion("fictional demo", seedFictionalDemoJobs(database));
} catch (error) {
  console.error(`demo seed 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  database.close();
}
