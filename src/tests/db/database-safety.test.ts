import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDatabasePath } from "../../db/connection";
import { resetDatabase, validateResetTarget } from "../../db/reset";
import { createTestDatabase, type TestDatabase } from "./test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });

describe("database filesystem safety", () => {
  it("환경 변수 경로를 해석하되 테스트 DB는 고유 임시 경로를 사용한다", () => {
    testDatabase = createTestDatabase();
    expect(testDatabase.path).toContain("nearby-jobs-test-");
    expect(testDatabase.path).not.toBe(resolve("data/nearby-jobs.sqlite"));
    expect(getDatabasePath({ ...process.env, NEARBY_JOBS_DB_PATH: "custom/test.sqlite" }, "C:/workspace")).toBe(resolve("C:/workspace/custom/test.sqlite"));
  });

  it("reset은 확인 플래그가 없으면 거부한다", () => {
    testDatabase = createTestDatabase();
    const { path, directory } = testDatabase;
    expect(() => resetDatabase(path, false, { allowedRoot: directory })).toThrow(/--confirm/);
    expect(existsSync(path)).toBe(true);
  });

  it("위험하거나 허용 범위 밖의 reset 경로를 거부한다", () => {
    testDatabase = createTestDatabase();
    const { directory } = testDatabase;
    expect(() => validateResetTarget(resolve("C:/"), directory)).toThrow(/안전한 data/);
    expect(() => validateResetTarget(join(directory, "..", "outside.sqlite"), directory)).toThrow(/안전한 data/);
  });

  it("확인된 대상 파일과 SQLite sidecar만 제거한다", () => {
    testDatabase = createTestDatabase();
    testDatabase.database.close();
    writeFileSync(`${testDatabase.path}-wal`, "test");
    writeFileSync(`${testDatabase.path}-shm`, "test");
    const removed = resetDatabase(testDatabase.path, true, { allowedRoot: testDatabase.directory });
    expect(removed).toHaveLength(3);
    expect(existsSync(testDatabase.path)).toBe(false);
  });
});
