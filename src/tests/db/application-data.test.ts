import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { DatabaseAccessError } from "../../db/connection";
import { seedFictionalDemoJobs } from "../../db/services/demo-seed-service";
import { ingestSanitizedFixtures } from "../../db/services/fixture-ingestion-service";
import { loadUiJobsFromDatabase } from "../../db/services/ui-data-service";
import { isMapEligible } from "../../services/job-search";
import { createTestDatabase, type TestDatabase } from "./test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });

describe("application SQLite data boundary", () => {
  it("없는 DB는 raw SQLite 오류 대신 setup 상태 코드로 구분한다", () => {
    testDatabase = createTestDatabase();
    testDatabase.database.close();
    const missing = `${testDatabase.directory}/missing.sqlite`;
    expect(() => loadUiJobsFromDatabase(missing)).toThrowError(expect.objectContaining<Partial<DatabaseAccessError>>({ code: "DATABASE_NOT_READY" }));
  });

  it("손상된 DB는 raw driver 오류 대신 corrupt 상태 코드로 구분한다", () => {
    testDatabase = createTestDatabase();
    testDatabase.database.close();
    writeFileSync(testDatabase.path, "not-a-sqlite-database");
    expect(() => loadUiJobsFromDatabase(testDatabase!.path)).toThrowError(
      expect.objectContaining<Partial<DatabaseAccessError>>({ code: "DATABASE_CORRUPT" }),
    );
  });

  it("setup 이후 기존 16개 UI record와 provenance·지도 정책을 복원한다", () => {
    testDatabase = createTestDatabase();
    ingestSanitizedFixtures(testDatabase.database);
    seedFictionalDemoJobs(testDatabase.database);
    testDatabase.database.close();
    const result = loadUiJobsFromDatabase(testDatabase.path);
    expect(result.diagnostics).toEqual([]);
    expect(result.jobs).toHaveLength(16);
    expect(result.jobs.filter(({ isFictional }) => isFictional)).toHaveLength(10);
    expect(result.jobs.filter(({ isFictional }) => !isFictional)).toHaveLength(6);
    const undecided = result.jobs.find(({ job }) => job.locationAccuracy === "location_undecided");
    expect(undecided).toBeDefined();
    if (undecided) expect(isMapEligible(undecided)).toBe(false);
    expect(result.jobs.find(({ job }) => job.id === "demo:am-002")?.mapPosition).toMatchObject({ kind: "estimated", provenance: "fictional_demo" });
    expect(result.jobs.find(({ job }) => job.id === "demo:jk-001")?.isFictional).toBe(true);
    expect(result.jobs.find(({ job }) => job.id === "jobkorea:49715720")?.isFictional).toBe(false);
  });
});
