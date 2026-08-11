import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { getDatabasePath, openReadonlyDatabase } from "../../db/connection";
import { listAppliedMigrations, loadMigrations } from "../../db/migrate";
import type { LocalReadiness } from "../../services/local-readiness";
import { ensurePublicDemoDatabase } from "../runtime/public-demo-database";
import { isVercelPublicDemo } from "../runtime/public-demo";

const require = createRequire(import.meta.url);
const isLoopbackHost = (host: string | null) => !host || /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);

export function getLocalReadiness(host: string | null): LocalReadiness {
  const publicDemo = isVercelPublicDemo();
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
  let databaseReady = false;
  let migrationsReady = false;
  try {
    const database = openReadonlyDatabase(publicDemo ? ensurePublicDemoDatabase() : getDatabasePath());
    try {
      databaseReady = true;
      const applied = new Set(listAppliedMigrations(database));
      migrationsReady = loadMigrations().every(({ version }) => applied.has(version));
    } finally { database.close(); }
  } catch { /* First-run readiness deliberately hides database details. */ }
  let chromiumReady = false;
  try {
    if (publicDemo) throw new Error("PUBLIC_DEMO_NO_BROWSER");
    const { chromium } = require("playwright") as typeof import("playwright");
    chromiumReady = existsSync(chromium.executablePath());
  } catch { /* Chromium is optional for non-collection usage. */ }
  const configuredBackup = process.env.NEARBY_JOBS_BACKUP_DIR?.trim();
  const backupDirectory = configuredBackup ? resolve(process.cwd(), configuredBackup) : join(dirname(getDatabasePath()), "backups");
  let latestBackupAvailable = false;
  try { latestBackupAvailable = readdirSync(backupDirectory).some((name) => name.endsWith(".manifest.json")); } catch { /* not created */ }
  return { version: pkg.version, databaseReady, migrationsReady, chromiumReady,
    collectionUiEnabled: process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI === "1",
    localhostSafe: isLoopbackHost(host), latestBackupAvailable };
}
