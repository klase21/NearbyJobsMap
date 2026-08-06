import { getDatabasePath, openWritableDatabase } from "../src/db/connection";
import { resetDatabase } from "../src/db/reset";
import { applyMigrations } from "../src/db/migrate";
import { ingestSanitizedFixtures } from "../src/db/services/fixture-ingestion-service";
import { seedFictionalDemoJobs } from "../src/db/services/demo-seed-service";

const phraseIndex = process.argv.indexOf("--confirm");
const confirmed = phraseIndex >= 0 && process.argv[phraseIndex + 1] === "RESET LOCAL DATABASE";
if (!confirmed) throw new Error('Use --confirm "RESET LOCAL DATABASE" to replace the local demo database.');
const path = getDatabasePath();
resetDatabase(path, true);
const database = openWritableDatabase(path);
try {
  applyMigrations(database);
  const fixtures = ingestSanitizedFixtures(database);
  const demo = seedFictionalDemoJobs(database);
  console.log(`database=${path} fixtures=${fixtures.inserted + fixtures.updated + fixtures.unchanged} demo=${demo.inserted + demo.updated + demo.unchanged}`);
} finally { database.close(); }
