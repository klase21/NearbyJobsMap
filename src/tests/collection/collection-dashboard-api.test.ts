import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as getDashboard } from "../../app/api/collection-dashboard/route";
import { GET as getRunDetail } from "../../app/api/collection-dashboard/runs/[runId]/route";
import { ingestSanitizedFixtures } from "../../db/services/fixture-ingestion-service";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

let testDatabase: TestDatabase;
beforeEach(() => { testDatabase = createTestDatabase(); ingestSanitizedFixtures(testDatabase.database); process.env.NEARBY_JOBS_DB_PATH = testDatabase.path; process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI = "1"; });
afterEach(() => { testDatabase.cleanup(); delete process.env.NEARBY_JOBS_DB_PATH; delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI; });

describe("collection dashboard read API", () => {
  it("accepts bounded filters and performs read-only aggregation", async () => {
    const before = (testDatabase.database.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number }).count;
    const response = await getDashboard(new Request("http://localhost/api/collection-dashboard?period=7d&source=jobkorea&status=completed"));
    expect(response.status).toBe(200); expect((await response.json()).dashboard.inventory.totalJobs).toBe(6);
    expect((testDatabase.database.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number }).count).toBe(before);
  });
  it.each(["period=90d", "source=other", "status=running", "sort=sql"])("rejects invalid query %s", async (query) => {
    const response = await getDashboard(new Request(`http://localhost/api/collection-dashboard?${query}`));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: expect.objectContaining({ code: "COLLECTION_DASHBOARD_FILTER_INVALID" }) });
  });
  it("strictly validates run IDs and returns unknown IDs without sensitive output", async () => {
    const invalid = await getRunDetail(new Request("http://localhost/api/collection-dashboard/runs/not-sql"), { params: Promise.resolve({ runId: "not-sql" }) });
    expect(invalid.status).toBe(400); expect(JSON.stringify(await invalid.json())).not.toMatch(/stack/i);
    const unknownId = "22222222-2222-4222-8222-222222222222";
    const unknown = await getRunDetail(new Request(`http://localhost/api/collection-dashboard/runs/${unknownId}`), { params: Promise.resolve({ runId: unknownId }) });
    expect(unknown.status).toBe(404);
  });
});
