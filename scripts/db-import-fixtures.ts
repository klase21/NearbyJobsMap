import { getDatabasePath, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { ingestSanitizedFixtures } from "../src/db/services/fixture-ingestion-service";
import { printIngestion } from "./db-cli";

const path = getDatabasePath();
const database = openWritableDatabase(path);
try {
  if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new Error("먼저 npm run db:migrate를 실행해 주세요.");
  printIngestion("sanitized fixtures", ingestSanitizedFixtures(database));
} catch (error) {
  console.error(`fixture import 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  database.close();
}
