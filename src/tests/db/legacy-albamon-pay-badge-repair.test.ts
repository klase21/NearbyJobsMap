import { afterEach, describe, expect, it } from "vitest";
import { JobRepository } from "../../db/repositories/job-repository";
import { auditLegacyAlbamonPayBadges, repairLegacyAlbamonPayBadges } from "../../db/repairs/legacy-albamon-pay-badge";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "./test-database";

let test: TestDatabase | null = null;
afterEach(() => { test?.cleanup(); test = null; });

const metadata = (reference: string) => ({
  recordKind: "fixture_derived" as const,
  evidenceType: "observed_html" as const,
  sourceFixtureReference: reference,
  mapPosition: null,
});

describe("legacy Albamon same-day-pay badge repair", () => {
  it("clears only unstructured Albamon badge contamination and is idempotent", () => {
    test = createTestDatabase();
    const repository = new JobRepository(test.database);
    const stale = canonicalJob({
      id: "albamon:101", source: "albamon", sourcePostingId: "101",
      sourceUrl: "https://www.albamon.com/jobs/detail/101", canonicalUrl: "https://www.albamon.com/jobs/detail/101",
      salary: { originalText: "당일지급", type: "unknown", minimumAmount: null, maximumAmount: null, currency: null,
        negotiable: false, includesIncentive: null, normalizedMonthlyMinimum: null, normalizedMonthlyMaximum: null,
        normalizationBasis: null, normalizationConfidence: null },
    });
    const valid = canonicalJob({
      id: "albamon:102", source: "albamon", sourcePostingId: "102",
      sourceUrl: "https://www.albamon.com/jobs/detail/102", canonicalUrl: "https://www.albamon.com/jobs/detail/102",
      salary: { originalText: "144,720원", type: "daily", minimumAmount: 144_720, maximumAmount: 144_720, currency: "KRW",
        negotiable: false, includesIncentive: null, normalizedMonthlyMinimum: null, normalizedMonthlyMaximum: null,
        normalizationBasis: "source payType=일급", normalizationConfidence: "high" },
    });
    const otherSource = canonicalJob({
      id: "jobkorea:103", sourcePostingId: "103", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/103",
      canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/103",
      salary: stale.salary,
    });
    repository.upsert(stale, metadata("legacy-no-pay-badge"));
    repository.upsert(valid, metadata("pay-the-day-1"));
    repository.upsert(otherSource, metadata("other-source"));
    test.database.prepare("UPDATE jobs SET salary_quality='display_only' WHERE id='albamon:101'").run();

    expect(auditLegacyAlbamonPayBadges(test.database)).toMatchObject({ targetCount: 1, independentlyStructuredCount: 0 });
    expect(repairLegacyAlbamonPayBadges(test.database).repairedCount).toBe(1);
    expect(repairLegacyAlbamonPayBadges(test.database).repairedCount).toBe(0);

    const rows = test.database.prepare("SELECT id,salary_original_text,salary_type,salary_minimum_amount,source_fixture_reference,salary_quality FROM jobs ORDER BY id").all();
    expect(rows).toEqual([
      { id: "albamon:101", salary_original_text: "", salary_type: "unknown", salary_minimum_amount: null, source_fixture_reference: "legacy-no-pay-badge", salary_quality: "unknown" },
      { id: "albamon:102", salary_original_text: "144,720원", salary_type: "daily", salary_minimum_amount: 144_720, source_fixture_reference: "pay-the-day-1", salary_quality: "structured" },
      { id: "jobkorea:103", salary_original_text: "당일지급", salary_type: "unknown", salary_minimum_amount: null, source_fixture_reference: "other-source", salary_quality: "display_only" },
    ]);
  });
});
