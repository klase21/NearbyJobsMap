import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../../app/api/collection-profile-comparison/route";
import { SavedCollectionProfileRepository } from "../../server/collection-profiles/repository";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

let testDatabase: TestDatabase;
beforeEach(() => { testDatabase = createTestDatabase(); process.env.NEARBY_JOBS_DB_PATH = testDatabase.path; process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI = "1"; });
afterEach(() => { testDatabase.cleanup(); delete process.env.NEARBY_JOBS_DB_PATH; delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI; });
const request = (body: unknown, host = "localhost") => new Request(`http://${host}/api/collection-profile-comparison`, { method: "POST", headers: { origin: `http://${host}`, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("profile comparison API", () => {
  it("returns a sanitized read-only comparison for two current profiles", async () => {
    const repository = new SavedCollectionProfileRepository(testDatabase.database); const base = { source: "jobkorea" as const, basePresetId: "seoul-ai", strategy: "jobkorea_keyword" as const, keyword: "AI", regions: ["seoul" as const], pages: 1, maxCandidates: 5, allowListingFallback: true, exclusion: { keywords: [], fields: ["title" as const] } };
    const a = repository.create({ ...base, name: "비교 하나" }); const b = repository.create({ ...base, name: "비교 둘" }); const before = repository.count();
    const response = await POST(request({ profileIds: [a.id, b.id], period: "30d", revisionScope: "current" })); expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json()); expect(text).toContain("비교 하나"); expect(text).not.toMatch(/stack|database path|raw_html|cookie/i); expect(repository.count()).toBe(before);
  });
  it("enforces feature, locality, origin, strict fields, and unknown profiles", async () => {
    expect((await POST(request({}, "example.com"))).status).toBe(403); delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI; expect((await POST(request({}))).status).toBe(403); process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI = "1";
    expect((await POST(request({ profileIds: [], period: "30d", revisionScope: "current", command: "run" }))).status).toBe(400);
    expect((await POST(request({ profileIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"], period: "30d", revisionScope: "current" }))).status).toBe(404);
  });
});
