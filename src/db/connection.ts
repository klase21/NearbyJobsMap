import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const DEFAULT_DATABASE_RELATIVE_PATH = "data/nearby-jobs.sqlite";

export type DatabaseFailureCode =
  | "DATABASE_NOT_READY"
  | "DATABASE_FILE_UNAVAILABLE"
  | "DATABASE_PARENT_UNAVAILABLE"
  | "DATABASE_LOCKED"
  | "DATABASE_CORRUPT"
  | "DATABASE_ERROR";

export class DatabaseAccessError extends Error {
  constructor(public readonly code: DatabaseFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseAccessError";
  }
}

export function getDatabasePath(environment: NodeJS.ProcessEnv = process.env, workingDirectory = process.cwd()): string {
  const configured = environment.NEARBY_JOBS_DB_PATH?.trim() || DEFAULT_DATABASE_RELATIVE_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(workingDirectory, configured);
}

function classifyDatabaseError(error: unknown, fallback: DatabaseFailureCode): DatabaseAccessError {
  if (error instanceof DatabaseAccessError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code = lower.includes("locked") || lower.includes("busy")
    ? "DATABASE_LOCKED"
    : lower.includes("malformed") || lower.includes("not a database") || lower.includes("corrupt")
      ? "DATABASE_CORRUPT"
      : fallback;
  return new DatabaseAccessError(code, message, { cause: error });
}

export function openWritableDatabase(path = getDatabasePath()): Database.Database {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    throw classifyDatabaseError(error, "DATABASE_PARENT_UNAVAILABLE");
  }
  try {
    const database = new Database(path);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    return database;
  } catch (error) {
    throw classifyDatabaseError(error, "DATABASE_FILE_UNAVAILABLE");
  }
}

export function openReadonlyDatabase(path = getDatabasePath()): Database.Database {
  if (!existsSync(path)) {
    throw new DatabaseAccessError("DATABASE_NOT_READY", "로컬 데이터베이스 파일이 없습니다.");
  }
  let database: Database.Database | null = null;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    database.pragma("foreign_keys = ON");
    database.pragma("query_only = ON");
    database.pragma("busy_timeout = 5000");
    const integrity = database.pragma("quick_check(1)", { simple: true });
    if (integrity !== "ok") {
      database.close();
      throw new DatabaseAccessError("DATABASE_CORRUPT", "로컬 데이터베이스 무결성 검사에 실패했습니다.");
    }
    return database;
  } catch (error) {
    if (database?.open) database.close();
    throw classifyDatabaseError(error, "DATABASE_FILE_UNAVAILABLE");
  }
}
