import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { JobKoreaCollectionResult } from "../../sources/jobkorea/collection/jobkorea-collection-types";
import { CollectionRunManager } from "../../server/collection-control/collection-run-manager";

const result = (mode: "dry-run" | "write"): JobKoreaCollectionResult => ({ runId: mode === "write" ? "db-run" : null, mode, status: "completed",
  presetId: "seoul-ai", presetLabel: "서울 AI 일자리", keyword: "AI", requestedRegions: ["seoul"], pageResults: [], listingPagesRequested: 1,
  listingPagesCompleted: 1, numericLinksExtracted: 12, uniquePostingIds: 5, seoulMatches: 5, gyeonggiMatches: 0, multipleRegionMatches: 0,
  unknownRegionCandidates: 0, excludedByRegion: 0, excludedRegionSamples: [], candidatesSelected: 5, detailPagesAttempted: 5,
  successfullyParsed: 0, activeJobs: 0, expiredOrClosedJobs: 0, transportFailures: 0, blockedDetails: 5, parseFailures: 0,
  predictedInserts: 2, predictedUpdates: 1, predictedUnchanged: 2, actualInserts: mode === "write" ? 2 : 0,
  actualUpdates: mode === "write" ? 1 : 0, actualUnchanged: mode === "write" ? 2 : 0, listingOnlyRecords: 5, failedRecords: 0,
  predictedLowerCompletenessSkips: 0, actualLowerCompletenessSkips: 0, totalSqliteJobs: mode === "write" ? 48 : 46, details: [], elapsedMs: 100 });

const fakeDb = () => ({ close: vi.fn() }) as never;

describe("CollectionRunManager", () => {
  it("runs a dry-run, retains progress, and issues a bound write authorization", async () => {
    const runCollection = vi.fn(async (options, dependencies) => {
      dependencies.onProgress?.({ status: "collecting_details", message: "상세 정보 2/5 확인 중", listingPagesRequested: 1, listingPagesCompleted: 1,
        numericLinksExtracted: 12, uniquePostingIds: 5, regionMatchingCandidates: 5, selectedCandidates: 5, detailAttemptsCompleted: 2,
        detailAttemptsTotal: 5, successfulDetailParses: 0, listingFallbacks: 2, failedRecords: 0, predictedInserts: 0, predictedUpdates: 0,
        predictedUnchanged: 0, actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0 });
      dependencies.onProgress?.({ status: "completed", message: "수집 완료", listingPagesRequested: 1, listingPagesCompleted: 1,
        numericLinksExtracted: 12, uniquePostingIds: 5, regionMatchingCandidates: 5, selectedCandidates: 5, detailAttemptsCompleted: 5,
        detailAttemptsTotal: 5, successfulDetailParses: 0, listingFallbacks: 5, failedRecords: 0, predictedInserts: 2, predictedUpdates: 1,
        predictedUnchanged: 2, actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0 });
      return result(options.mode);
    });
    const manager = new CollectionRunManager({ runCollection, openReadonly: fakeDb, openWritable: fakeDb });
    const started = manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run" });
    await vi.waitFor(() => expect(manager.get(started.runId)?.status).toBe("completed"));
    const completed = manager.get(started.runId)!;
    expect(completed.result).not.toBeNull();
    expect(completed.writeAuthorizationToken).toBeTruthy();
    expect(completed.listingFallbacks).toBe(5);
    const write = manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "write",
      writeAuthorizationToken: completed.writeAuthorizationToken!, confirmationPhrase: "WRITE seoul-ai" });
    await vi.waitFor(() => expect(manager.get(write.runId)?.status).toBe("completed"));
    expect(runCollection).toHaveBeenCalledTimes(2);
  });

  it("enforces one active run and rejects unsafe limits", async () => {
    let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve; });
    const manager = new CollectionRunManager({ runCollection: vi.fn(async (options) => { await pending; return result(options.mode); }), openReadonly: fakeDb });
    manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run" });
    expect(() => manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run" })).toThrow(/이미/);
    release(); await vi.waitFor(() => expect(manager.active()).toBeNull());
    expect(() => manager.start({ presetId: "seoul-ai", pages: 4, maxDetails: 5, mode: "dry_run" })).toThrow(/페이지/);
    expect(() => manager.start({ presetId: "unknown" as never, pages: 1, maxDetails: 5, mode: "dry_run" })).toThrow(/프리셋/);
  });

  it("rejects changed, expired, and incorrectly confirmed writes", async () => {
    let now = new Date("2026-08-06T00:00:00Z");
    const manager = new CollectionRunManager({ runCollection: vi.fn(async (options) => result(options.mode)), openReadonly: fakeDb, openWritable: fakeDb, now: () => now });
    const dry = manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run" });
    await vi.waitFor(() => expect(manager.get(dry.runId)?.status).toBe("completed")); const token = manager.get(dry.runId)!.writeAuthorizationToken!;
    expect(() => manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 4, mode: "write", writeAuthorizationToken: token, confirmationPhrase: "WRITE seoul-ai" })).toThrow(/변경/);
    expect(() => manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "write", writeAuthorizationToken: token, confirmationPhrase: "wrong" })).toThrow(/문구/);
    now = new Date("2026-08-06T00:31:00Z");
    expect(() => manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "write", writeAuthorizationToken: token, confirmationPhrase: "WRITE seoul-ai" })).toThrow(/만료/);
  });

  it("sanitizes failures and clears the active slot", async () => {
    const manager = new CollectionRunManager({ runCollection: vi.fn(async () => { throw Object.assign(new Error("safe failure"), { stack: "private" }); }), openReadonly: fakeDb });
    const run = manager.start({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run" });
    await vi.waitFor(() => expect(manager.get(run.runId)?.status).toBe("failed"));
    expect(manager.get(run.runId)?.error).toEqual({ code: "COLLECTION_RUN_FAILED", message: "safe failure" });
    expect(manager.active()).toBeNull(); expect(manager.get("stale")).toBeNull();
  });
});
