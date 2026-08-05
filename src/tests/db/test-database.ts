import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWritableDatabase } from "../../db/connection";
import { applyMigrations } from "../../db/migrate";

export interface TestDatabase {
  database: Database.Database;
  directory: string;
  path: string;
  cleanup(): void;
}

export function createTestDatabase(migrate = true): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), "nearby-jobs-test-"));
  const path = join(directory, "test.sqlite");
  const database = openWritableDatabase(path);
  if (migrate) applyMigrations(database);
  return {
    database, directory, path,
    cleanup() {
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
