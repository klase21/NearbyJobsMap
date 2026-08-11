import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_ORIGIN } from "../../repositories/preferences-repository";
import { DEFAULT_FILTERS } from "../../services/job-search";
import { GET as getJobs } from "../../app/api/jobs/route";
import { POST as startCollection } from "../../app/api/collection-runs/route";
import { POST as startBackfill } from "../../app/api/backfill-runs/route";
import { PATCH as patchJobState } from "../../app/api/job-user-state/[jobId]/route";
import { getJobsPage } from "../../server/jobs-page/service";
import { getPersonalAlbamonProfile, savePersonalAlbamonProfile } from "../../server/personal-albamon-profile/service";
import { createPublicDemoJobs, ensurePublicDemoDatabase } from "../../server/runtime/public-demo-database";
import { getPublicDemoDatabasePath, isVercelPublicDemo } from "../../server/runtime/public-demo";
import { openReadonlyDatabase } from "../../db/connection";

const originalVercel = process.env.VERCEL;
const originalRealUse = process.env.NEARBY_JOBS_REAL_USE_MODE;
const runtimePath = getPublicDemoDatabasePath({ VERCEL: "1" }, tmpdir(), process.pid);
const cleanRuntime = () => { for (const suffix of ["", "-wal", "-shm"]) rmSync(`${runtimePath}${suffix}`, { force: true }); };
const enablePublicDemo = () => { process.env.VERCEL = "1"; delete process.env.NEARBY_JOBS_REAL_USE_MODE; };

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
  if (originalRealUse === undefined) delete process.env.NEARBY_JOBS_REAL_USE_MODE; else process.env.NEARBY_JOBS_REAL_USE_MODE = originalRealUse;
  cleanRuntime();
});

describe("Vercel public demo runtime", () => {
  it("detects only Vercel without real-use mode and uses temp storage", () => {
    expect(isVercelPublicDemo({ VERCEL: "1" })).toBe(true);
    expect(isVercelPublicDemo({ VERCEL: "1", NEARBY_JOBS_REAL_USE_MODE: "1" })).toBe(false);
    expect(isVercelPublicDemo({})).toBe(false);
    expect(getPublicDemoDatabasePath({ VERCEL: "1" }, "C:/runtime-temp", 42)).toBe(join("C:/runtime-temp", "nearby-jobs-map-demo-v1-42.sqlite"));
  });

  it("builds a deterministic bounded demo universe with duplicate groups", () => {
    const first = createPublicDemoJobs(); const second = createPublicDemoJobs();
    expect(first).toEqual(second); expect(first).toHaveLength(30);
    expect(new Set(first.map(({ job }) => `${job.source}:${job.sourcePostingId}`)).size).toBe(30);
    expect(first[10]?.job.title).toBe(first[0]?.job.title);
    expect(first[11]?.job.companyName).toBe(first[1]?.job.companyName);
  });

  it("initializes an idempotent ephemeral SQLite database", () => {
    const directory = mkdtempSync(join(tmpdir(), "nearby-public-demo-"));
    try {
      const environment = { VERCEL: "1" }; const first = ensurePublicDemoDatabase(environment, directory, 7);
      const second = ensurePublicDemoDatabase(environment, directory, 7); expect(second).toBe(first);
      const database = openReadonlyDatabase(first);
      try { expect((database.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number }).count).toBe(30); }
      finally { database.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("serves the existing jobs pipeline with pagination, monthly filtering, and combined ranking", async () => {
    enablePublicDemo(); cleanRuntime();
    const response = await getJobs(); expect(response.status).toBe(200);
    const body = await response.json(); expect(body.items.length).toBeGreaterThan(0); expect(body.summary.total).toBe(30);
    const pageTwo = getJobsPage({ page: 2, pageSize: 25, filters: DEFAULT_FILTERS, sort: "newest", workspaceView: "all", applyPersonalExclusions: false });
    expect(pageTwo.pagination).toMatchObject({ page: 2, pageSize: 25, totalItems: 28, totalPages: 2 });
    const ranked = getJobsPage({ page: 1, pageSize: 25, filters: { ...DEFAULT_FILTERS, salaryType: "monthly" }, sort: "monthly_distance",
      workspaceView: "all", applyPersonalExclusions: false, origin: { latitude: DEFAULT_ORIGIN.latitude, longitude: DEFAULT_ORIGIN.longitude } });
    expect(ranked.items.length).toBeGreaterThan(0); expect(ranked.monthlyDistanceRankings).toHaveLength(ranked.items.length);
  });

  it("rejects collection, backfill, and personal writes before persistence", async () => {
    enablePublicDemo(); cleanRuntime();
    const collection = await startCollection(new Request("https://demo.example/api/collection-runs", { method: "POST" }));
    const backfill = await startBackfill(new Request("https://demo.example/api/backfill-runs", { method: "POST" }));
    const personal = await patchJobState(new Request("https://demo.example/api/job-user-state/demo:public-001", { method: "PATCH" }), { params: Promise.resolve({ jobId: "demo:public-001" }) });
    for (const response of [collection, backfill, personal]) {
      expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("PUBLIC_DEMO_READ_ONLY");
    }
    expect(getPersonalAlbamonProfile()).toEqual({ configured: false, profile: null, profileHash: null });
    expect(() => savePersonalAlbamonProfile({})).toThrow("읽기 전용");
  });

  it("keeps collector managers behind the access guard", () => {
    for (const file of ["src/app/api/collection-runs/route.ts", "src/app/api/backfill-runs/route.ts"]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).not.toMatch(/^import .*\/(collection-run-manager|manager)";/mu);
      expect(source.indexOf("assertLocalCollectionAccess(request)")).toBeLessThan(source.indexOf("await import("));
    }
  });
});
