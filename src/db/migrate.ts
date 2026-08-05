import type Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openWritableDatabase } from "./connection";

export interface MigrationDefinition {
  version: string;
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export class MigrationError extends Error {
  constructor(public readonly version: string | null, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MigrationError";
  }
}

const DEFAULT_MIGRATIONS_DIRECTORY = resolve(process.cwd(), "src", "db", "migrations");
const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_-]+)\.sql$/;

export function loadMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY): MigrationDefinition[] {
  const migrations = readdirSync(directory).flatMap((fileName) => {
    const match = fileName.match(MIGRATION_PATTERN);
    if (!match) return [];
    return [{ version: match[1]!, name: match[2]!, sql: readFileSync(join(directory, fileName), "utf8") }];
  }).sort((a, b) => a.version.localeCompare(b.version));
  const versions = new Set<string>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new MigrationError(migration.version, `중복 migration version: ${migration.version}`);
    versions.add(migration.version);
  }
  return migrations;
}

export function ensureMigrationTable(database: Database.Database): void {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}

export function listAppliedMigrations(database: Database.Database): string[] {
  const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!table) return [];
  return (database.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: string }>).map(({ version }) => version);
}

export function applyMigrations(database: Database.Database, migrations = loadMigrations()): MigrationResult {
  ensureMigrationTable(database);
  const applied = new Set(listAppliedMigrations(database));
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    try {
      database.transaction(() => {
        database.exec(migration.sql);
        database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.version, migration.name, new Date().toISOString());
      })();
      newlyApplied.push(migration.version);
      applied.add(migration.version);
    } catch (error) {
      throw new MigrationError(migration.version, `migration ${migration.version}_${migration.name} 적용 실패`, { cause: error });
    }
  }
  return { applied: newlyApplied, alreadyApplied: [...applied].filter((version) => !newlyApplied.includes(version)).sort() };
}

export function migrateDatabase(path?: string): MigrationResult {
  const database = openWritableDatabase(path);
  try {
    return applyMigrations(database);
  } finally {
    database.close();
  }
}
