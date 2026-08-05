import { afterEach, describe, expect, it } from "vitest";
import { IngestionRunRepository } from "../../db/repositories/ingestion-run-repository";
import { IngestionService } from "../../db/services/ingestion-service";
import { getDemoSeedRecords, seedFictionalDemoJobs } from "../../db/services/demo-seed-service";
import { getFixtureIngestionRecords, ingestSanitizedFixtures } from "../../db/services/fixture-ingestion-service";
import type { IngestionRecord } from "../../db/schema";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "./test-database";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const database = () => (testDatabase = createTestDatabase()).database;

describe("idempotent local ingestion", () => {
  it("fixture 첫 import는 6건을 삽입하고 두 번째는 모두 unchanged다", () => {
    const db = database();
    const first = ingestSanitizedFixtures(db);
    const second = ingestSanitizedFixtures(db);
    expect(first).toMatchObject({ inserted: 6, updated: 0, unchanged: 0, failed: 0 });
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: 6, failed: 0 });
    expect((db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }).count).toBe(6);
  });

  it("demo 첫 seed는 10건을 삽입하고 반복 seed는 중복을 만들지 않는다", () => {
    const db = database();
    const first = seedFictionalDemoJobs(db);
    const second = seedFictionalDemoJobs(db);
    expect(first).toMatchObject({ inserted: 10, unchanged: 0, failed: 0 });
    expect(second).toMatchObject({ inserted: 0, unchanged: 10, failed: 0 });
    expect((db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }).count).toBe(10);
  });

  it("잘못된 한 레코드는 진단되고 정상 레코드는 저장된다", () => {
    const db = database();
    const valid = getFixtureIngestionRecords()[0]!;
    const invalid = { ...valid, job: canonicalJob({ id: "invalid", sourcePostingId: "invalid", title: "" }) };
    const result = new IngestionService(db).ingest([valid, invalid], { source: "mixed", ingestionType: "sanitized_fixture" });
    expect(result).toMatchObject({ inserted: 1, failed: 1 });
    expect(result.diagnostics.map(({ code }) => code)).toContain("JOB_TITLE_MISSING");
    expect((db.prepare("SELECT status, inserted_count, failed_count FROM ingestion_runs WHERE id = ?").get(result.runId) as { status: string; inserted_count: number; failed_count: number })).toEqual({ status: "partial", inserted_count: 1, failed_count: 1 });
  });

  it("구조 자체가 손상된 레코드도 run 전체를 중단하지 않는다", () => {
    const db = database();
    const valid = getFixtureIngestionRecords()[0]!;
    const malformed = { job: null, metadata: null } as unknown as IngestionRecord;
    const result = new IngestionService(db).ingest([malformed, valid], { source: "mixed", ingestionType: "sanitized_fixture" });
    expect(result).toMatchObject({ inserted: 1, failed: 1 });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "INGESTION_RECORD_INVALID_SHAPE" }));
  });

  it("한 입력 안의 exact identity 중복은 skipped로 기록한다", () => {
    const db = database();
    const record = getDemoSeedRecords()[0]!;
    const result = new IngestionService(db).ingest([record, record], { source: "local_demo", ingestionType: "fictional_demo_seed" });
    expect(result).toMatchObject({ inserted: 1, skipped: 1, failed: 0 });
    expect(result.diagnostics[0]?.code).toBe("DUPLICATE_INPUT_IDENTITY");
  });

  it("실패한 ingestion run은 완료로 오인되지 않는다", () => {
    const db = database();
    const runs = new IngestionRunRepository(db);
    const id = runs.begin("mixed", "sanitized_fixture", 1);
    runs.fail(id, "fixture parsing failed");
    expect(db.prepare("SELECT status, error_summary FROM ingestion_runs WHERE id = ?").get(id)).toEqual({ status: "failed", error_summary: "fixture parsing failed" });
  });
});
