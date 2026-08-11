import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, listAppliedMigrations, loadMigrations } from "../../db/migrate";
import { createTestDatabase, type TestDatabase } from "./test-database";
import { ingestSanitizedFixtures } from "../../db/services/fixture-ingestion-service";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });

describe("SQLite migration", () => {
  it("빈 데이터베이스에 초기 migration을 적용하고 버전을 기록한다", () => {
    testDatabase = createTestDatabase(false);
    const result = applyMigrations(testDatabase.database);
    expect(result.applied).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011", "0012", "0013", "0014", "0015"]);
    expect(listAppliedMigrations(testDatabase.database)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011", "0012", "0013", "0014", "0015"]);
    expect(testDatabase.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get()).toBeTruthy();
    expect(testDatabase.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_collection_profiles'").get()).toBeTruthy();
  });

  it("반복 실행은 schema를 다시 적용하지 않는다", () => {
    testDatabase = createTestDatabase();
    expect(applyMigrations(testDatabase.database)).toMatchObject({ applied: [], alreadyApplied: ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011", "0012", "0013", "0014", "0015"] });
  });

  it("알바몬 결합 source-filter를 수도권 범위로 교정해도 공고와 관찰을 보존한다", () => {
    testDatabase = createTestDatabase();
    ingestSanitizedFixtures(testDatabase.database);
    const job = testDatabase.database.prepare("SELECT id FROM jobs WHERE source='albamon' LIMIT 1").get() as { id: string };
    testDatabase.database.prepare(`UPDATE jobs SET normalized_regions_json='["seoul","gyeonggi"]', region_evidence_source='source_filter', source_area_code='I000,B000', displayed_location_present=0 WHERE id=?`).run(job.id);
    testDatabase.database.prepare(`UPDATE job_provenance_history SET normalized_regions_json='["seoul","gyeonggi"]', region_evidence_source='source_filter', source_area_code='I000,B000', displayed_location_present=0 WHERE job_id=?`).run(job.id);
    const beforeJobs = testDatabase.database.prepare("SELECT COUNT(*) count FROM jobs").get();
    const beforeObservations = testDatabase.database.prepare("SELECT COUNT(*) count FROM job_observations").get();
    testDatabase.database.exec(readFileSync("src/db/migrations/0014_albamon_capital_scope.sql", "utf8"));
    expect(testDatabase.database.prepare("SELECT normalized_regions_json FROM jobs WHERE id=?").get(job.id)).toEqual({ normalized_regions_json: '["capital_scope"]' });
    expect(testDatabase.database.prepare("SELECT normalized_regions_json FROM job_provenance_history WHERE job_id=?").get(job.id)).toEqual({ normalized_regions_json: '["capital_scope"]' });
    expect(testDatabase.database.prepare("SELECT COUNT(*) count FROM jobs").get()).toEqual(beforeJobs);
    expect(testDatabase.database.prepare("SELECT COUNT(*) count FROM job_observations").get()).toEqual(beforeObservations);
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
