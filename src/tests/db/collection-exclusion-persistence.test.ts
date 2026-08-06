import { afterEach, describe, expect, it } from "vitest";
import { IngestionRunRepository } from "../../db/repositories/ingestion-run-repository";
import { createTestDatabase, type TestDatabase } from "./test-database";

describe("collection exclusion run metadata", () => {
  let testDatabase: TestDatabase | null = null;
  afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });

  it("persists normalized configuration and aggregate selection counts at run level", () => {
    testDatabase = createTestDatabase(); const repository = new IngestionRunRepository(testDatabase.database);
    const runId = repository.begin("jobkorea", "jobkorea_one_shot_transport", 10, { permissionStatus: "unverified",
      listingUrl: "https://www.jobkorea.co.kr/Search?stext=AI", maxDetails: 10, contentRequestLimit: 10, preflightRequestLimit: 0,
      dryRun: false, exclusionKeywords: ["강사", "웨이터"], exclusionFields: ["title", "category"], exclusionConfigHash: "abc" });
    repository.updateExclusionSummary(runId, 4, 10);
    const row = testDatabase.database.prepare("SELECT exclusion_keywords_json, exclusion_fields_json, exclusion_config_hash, excluded_candidate_count, selected_candidate_count_after_exclusion FROM ingestion_runs WHERE id = ?").get(runId) as Record<string, unknown>;
    expect(JSON.parse(row.exclusion_keywords_json as string)).toEqual(["강사", "웨이터"]);
    expect(JSON.parse(row.exclusion_fields_json as string)).toEqual(["title", "category"]);
    expect(row).toMatchObject({ exclusion_config_hash: "abc", excluded_candidate_count: 4, selected_candidate_count_after_exclusion: 10 });
  });
});
