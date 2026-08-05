import { getDatabasePath } from "../src/db/connection";
import { migrateDatabase } from "../src/db/migrate";

try {
  const path = getDatabasePath();
  const result = migrateDatabase(path);
  console.log(`database=${path}`);
  console.log(result.applied.length ? `applied=${result.applied.join(",")}` : "applied=none");
  console.log(`already_applied=${result.alreadyApplied.join(",") || "none"}`);
} catch (error) {
  console.error(`migration 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
