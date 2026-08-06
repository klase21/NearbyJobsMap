import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, listAppliedMigrations, loadMigrations } from "../../db/migrate";
import { createTestDatabase, type TestDatabase } from "./test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });

describe("SQLite migration", () => {
  it("빈 데이터베이스에 초기 migration을 적용하고 버전을 기록한다", () => {
    testDatabase = createTestDatabase(false);
    const result = applyMigrations(testDatabase.database);
    expect(result.applied).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);
    expect(listAppliedMigrations(testDatabase.database)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006"]);
    expect(testDatabase.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get()).toBeTruthy();
  });

  it("반복 실행은 schema를 다시 적용하지 않는다", () => {
    testDatabase = createTestDatabase();
    expect(applyMigrations(testDatabase.database)).toMatchObject({ applied: [], alreadyApplied: ["0001", "0002", "0003", "0004", "0005", "0006"] });
  });

  it("실패한 migration은 성공으로 표시하지 않는다", () => {
    testDatabase = createTestDatabase(false);
    const directory = join(testDatabase.directory, "migrations");
    mkdirSync(directory);
    writeFileSync(join(directory, "0002_broken.sql"), "CREATE TABLE partial_table(id TEXT); INVALID SQL;");
    expect(() => applyMigrations(testDatabase!.database, loadMigrations(directory))).toThrow(/0002/);
    expect(listAppliedMigrations(testDatabase.database)).not.toContain("0002");
    expect(testDatabase.database.prepare("SELECT name FROM sqlite_master WHERE name='partial_table'").get()).toBeUndefined();
  });
});
