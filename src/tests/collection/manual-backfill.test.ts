import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { parseAlbamonCollectionArgs } from "../../sources/albamon/collection/albamon-collection-cli";
import {
  ALBAMON_HISTORICAL_BACKFILL_HARD_MAX_PAGES,
  buildAlbamonHistoricalListingUrl,
  isAlbamonSourceTotalExhausted,
} from "../../sources/albamon/collection/albamon-url-policy";
import { resolvePostingDateAtCutoff } from "../../services/collection-date";
import {
  ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES,
  MANUAL_BACKFILL_DEFAULT_MAX_PAGES,
  MANUAL_BACKFILL_HARD_MAX_PAGES,
  MANUAL_BACKFILL_PAGE_OPTIONS,
  MANUAL_BACKFILL_USER_MAX_PAGES,
  resolveBackfillCutoff,
  validateBackfillConfig,
  validateBackfillInternalPageLimit,
} from "../../server/manual-backfill/validation";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { listRecentManualBackfills } from "../../server/manual-backfill/recent";
import { ManualBackfillManager } from "../../server/manual-backfill/manager";
import type { ManualBackfillSnapshot } from "../../server/manual-backfill/contracts";
import type { PersonalAlbamonProfileState } from "../../server/personal-albamon-profile/service";

let test: TestDatabase | null = null;
afterEach(() => { test?.cleanup(); test = null; });

const albamonPage = (pageNumber = 1, options: { exhausted?: boolean; parserFailure?: boolean } = {}) => ({
  pageNumber, observedAt: "2026-08-11T01:00:00.000Z", requestedUrl: `https://www.albamon.com/jobs/total?page=${pageNumber}`,
  finalUrl: `https://www.albamon.com/jobs/total?page=${pageNumber}`, classification: options.parserFailure ? "malformed" as const : "valid_results" as const,
  extractedNumericLinkCount: 1, uniquePostingIdCount: 1, uniqueNewPostingIdCount: 1, sourceReportsNoResults: false,
  blocked: false, parserFailure: options.parserFailure ?? false, validEmptyPage: false, candidates: [],
  diagnosticCodes: options.exhausted ? ["ALBAMON_SOURCE_TOTAL_EXHAUSTED"] : [],
});
const sourceResult = (selected = 1, pageResults = [albamonPage(1, { exhausted: true })]) => ({
  pageResults, validListingCards: selected, candidatesSelected: selected,
  predictedInserts: selected, predictedUpdates: 0, predictedUnchanged: 0, predictedLowerCompletenessSkips: 0,
  actualInserts: selected, actualUpdates: 0, actualUnchanged: 0, actualLowerCompletenessSkips: 0,
  uniquePostingIds: selected, observedUniquePostingIds: selected, runId: null, sourceTotalCount: selected,
  candidatesExcluded: 0, monthlyStructuredSalary: selected, hourlyStructuredSalary: 0, dailyStructuredSalary: 0,
  salaryDisplayPresent: selected, coordinatesAccepted: selected,
});
const exclusion = { keywords: ["강사", "전기"], fields: ["title", "company"] as const };
const albamonConfig = { source: "albamon" as const, scope: "albamon_personal_all" as const, cutoffDate: null,
  maxPages: 150, exclusion: { keywords: [...exclusion.keywords], fields: [...exclusion.fields] }, personalProfileHash: null };
const personalProfileState = (keywords = exclusion.keywords, profileHash = "PROFILE_HASH"): PersonalAlbamonProfileState => ({
  configured: true,
  profile: { version: 1, albamon: { areas: "I000,B000", searchPeriodType: "ALL", sortType: "MONTHLY_SALARY",
    excludeBar: true, exclusions: [...keywords] }, updatedAt: "2026-08-11T01:00:00.000Z" },
  profileHash,
});

describe("manual historical backfill contract", () => {
  it("resolves supported JobKorea date ranges in Asia/Seoul and rejects future custom dates", () => {
    expect(resolveBackfillCutoff({ days: 7 }, new Date("2026-08-11T10:00:00+09:00"))).toBe("2026-08-05");
    expect(resolveBackfillCutoff({ since: "2026-08-01" }, new Date("2026-08-11T10:00:00+09:00"))).toBe("2026-08-01");
    expect(() => resolveBackfillCutoff({ since: "2026-08-12" }, new Date("2026-08-11T10:00:00+09:00"))).toThrow();
  });

  it("keeps ordinary Albamon collection at five pages", () => {
    expect(() => parseAlbamonCollectionArgs(["--preset", "albamon-capital-today", "--pages", "6", "--max-details", "50", "--dry-run", "--confirm"]))
      .toThrow("ALBAMON_PAGES_INVALID");
  });

  it("defaults the Albamon personal profile to 150 pages and preserves the 300-page user ceiling", () => {
    expect(MANUAL_BACKFILL_PAGE_OPTIONS).toEqual([50, 100, 150, 200, 300]);
    expect(MANUAL_BACKFILL_DEFAULT_MAX_PAGES).toBe(100);
    expect(ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES).toBe(150);
    expect(MANUAL_BACKFILL_USER_MAX_PAGES).toBe(300);
    expect(validateBackfillConfig({ source: "albamon", exclusion })).toEqual(albamonConfig);
    expect(validateBackfillConfig({ source: "albamon", maxPages: 300, exclusion }).maxPages).toBe(300);
    expect(() => validateBackfillConfig({ source: "albamon", maxPages: 301, exclusion })).toThrow();
    expect(validateBackfillConfig({ source: "jobkorea", cutoffDate: "2026-08-01" }).maxPages).toBe(100);
  });

  it("retains a separate absolute 500-page internal transport ceiling", () => {
    expect(MANUAL_BACKFILL_HARD_MAX_PAGES).toBe(500);
    expect(ALBAMON_HISTORICAL_BACKFILL_HARD_MAX_PAGES).toBe(500);
    expect(validateBackfillInternalPageLimit(500)).toBe(500);
    expect(() => validateBackfillInternalPageLimit(501)).toThrow();
    expect(new URL(buildAlbamonHistoricalListingUrl(500)).searchParams.get("page")).toBe("500");
    expect(() => buildAlbamonHistoricalListingUrl(501)).toThrow("ALBAMON_PAGE_INVALID");
  });

  it("builds the ALL-period Albamon profile URL without salary eligibility", () => {
    const url = new URL(buildAlbamonHistoricalListingUrl(2, "I000,B000", 500, exclusion.keywords, "MONTHLY_SALARY"));
    expect(url.pathname).toBe("/jobs/total");
    expect(url.searchParams.get("sortType")).toBe("MONTHLY_SALARY");
    expect(url.searchParams.get("size")).toBe("50");
    expect(url.searchParams.get("searchPeriodType")).toBe("ALL");
    expect(url.searchParams.get("excludeBar")).toBe("true");
    expect(url.searchParams.get("areas")).toBe("I000,B000");
    expect(url.searchParams.get("excludeKeywords")).toBe("강사,전기");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("stops from the trustworthy source total without using posting dates or duplicate-only pages", () => {
    expect(isAlbamonSourceTotalExhausted(104, 5_240)).toBe(false);
    expect(isAlbamonSourceTotalExhausted(105, 5_240)).toBe(true);
    expect(isAlbamonSourceTotalExhausted(150, null)).toBe(false);
  });

  it("resolves historical JobKorea evidence without backdating discovery", () => {
    expect(resolvePostingDateAtCutoff("3일전", "2026-08-11T01:00:00.000Z", "2026-08-08"))
      .toMatchObject({ resolvedDate: "2026-08-08", onOrAfterCutoff: true });
    expect(resolvePostingDateAtCutoff("4일전", "2026-08-11T01:00:00.000Z", "2026-08-08").onOrAfterCutoff).toBe(false);
  });

  it("reads compact persisted backfill history including ALL-period runs", () => {
    test = createTestDatabase();
    test.database.prepare(`INSERT INTO ingestion_runs(id,source,ingestion_type,status,started_at,input_record_count,created_at,operation_kind,cutoff_date,pages_scanned,stop_reason)
      VALUES('run','albamon','albamon_listing_collection','completed','2026-08-11',10,'2026-08-11','manual_backfill',NULL,3,'source_total_exhausted')`).run();
    expect(listRecentManualBackfills(test.database)).toEqual([expect.objectContaining({ id: "run", source: "albamon", cutoffDate: null, pages: 3, stopReason: "source_total_exhausted" })]);
  });

  it("keeps preview read-only and binds write authorization to ALL scope, limit, and exclusions", async () => {
    test = createTestDatabase();
    const source = vi.fn(async () => sourceResult(8));
    const backup = vi.fn(async () => ({ filePath: "ignored.sqlite", manifestPath: "ignored.json", manifest: {} }));
    let profile = personalProfileState();
    const manager = new ManualBackfillManager({ databasePath: test.path, runAlbamon: source as never, createBackup: backup as never,
      loadPersonalProfile: () => profile, now: () => new Date("2026-08-11T01:00:00Z") });
    const before = Number((test.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get() as { count: number }).count);
    const preview = await completed(manager, manager.start({ ...albamonConfig, mode: "dry_run" }).id);
    expect(preview.result).toMatchObject({ selected: 8, sourceTotal: 8, monthlyRecords: 8 });
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ pages: 150, maxDetails: 7_500,
      personalProfileBackfill: true, historicalSortType: "MONTHLY_SALARY",
      exclusion: { keywords: exclusion.keywords, fields: ["title", "category"] } }), expect.anything());
    expect(backup).not.toHaveBeenCalled();
    expect(Number((test.database.prepare("SELECT COUNT(*) count FROM ingestion_runs").get() as { count: number }).count)).toBe(before);
    profile = personalProfileState(["변경"], "CHANGED_PROFILE_HASH");
    expect(() => manager.start({ ...albamonConfig, mode: "write",
      writeAuthorizationToken: preview.writeAuthorizationToken!, confirmationPhrase: "BACKFILL albamon ALL" })).toThrow();
  });

  it("requires explicit ALL write confirmation and creates exactly one pre-write backup", async () => {
    test = createTestDatabase();
    const source = vi.fn(async () => sourceResult());
    const backup = vi.fn(async () => ({ filePath: "ignored.sqlite", manifestPath: "ignored.json", manifest: {} }));
    const manager = new ManualBackfillManager({ databasePath: test.path, runAlbamon: source as never, createBackup: backup as never,
      loadPersonalProfile: () => personalProfileState(), now: () => new Date("2026-08-11T01:00:00Z") });
    const preview = await completed(manager, manager.start({ ...albamonConfig, mode: "dry_run" }).id);
    expect(() => manager.start({ ...albamonConfig, mode: "write", writeAuthorizationToken: preview.writeAuthorizationToken!, confirmationPhrase: "WRONG" })).toThrow();
    const write = await completed(manager, manager.start({ ...albamonConfig, mode: "write", writeAuthorizationToken: preview.writeAuthorizationToken!, confirmationPhrase: "BACKFILL albamon ALL" }).id);
    expect(write.result?.inserted).toBe(1);
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it("reuses one safe preview authorization and performs a fresh write traversal without an authorization crawl", async () => {
    test = createTestDatabase();
    let previewPageRequests=0,writePageRequests=0;const writeAuthorizationPreviewRequests=0;
    const events:string[]=[];
    const pages=[albamonPage(1),albamonPage(2),albamonPage(3,{exhausted:true})];
    const source=vi.fn(async (options:{mode:"dry-run"|"write"},dependencies:{onPage?:(page:ReturnType<typeof albamonPage>)=>void})=>{
      for(const page of pages)dependencies.onPage?.(page);
      if(options.mode==="dry-run")previewPageRequests+=pages.length;else writePageRequests+=pages.length;
      events.push(`source:${options.mode}`);
      return sourceResult(options.mode==="write"?7:5,pages);
    });
    const backup=vi.fn(async()=>{events.push("backup");return{filePath:"ignored.sqlite",manifestPath:"ignored.json",manifest:{}};});
    const manager=new ManualBackfillManager({databasePath:test.path,runAlbamon:source as never,createBackup:backup as never,
      loadPersonalProfile:()=>personalProfileState(),now:()=>new Date("2026-08-11T01:00:00Z")});
    const preview=await completed(manager,manager.start({...albamonConfig,mode:"dry_run"}).id);
    expect(preview).toMatchObject({status:"completed",result:{pages:3,selected:5,parserErrors:0,fullExhausted:true,stopReason:"source_total_exhausted"}});
    const write=await completed(manager,manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,
      confirmationPhrase:"BACKFILL albamon ALL"}).id);
    expect(write.result).toMatchObject({selected:7,dryRunCandidateCount:5,writeCandidateCount:7,candidateDelta:2,newSinceDryRun:2});
    expect(events).toEqual(["source:dry-run","backup","source:write"]);
    expect(previewPageRequests).toBe(3);expect(writeAuthorizationPreviewRequests).toBe(0);expect(writePageRequests).toBe(3);
    expect(previewPageRequests+writeAuthorizationPreviewRequests+writePageRequests).toBe(6);
    expect(source).toHaveBeenCalledTimes(2);expect(backup).toHaveBeenCalledTimes(1);
    expect(()=>manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"})).toThrow();
  });

  it("does not authorize incomplete or parser-failed previews", async () => {
    test=createTestDatabase();
    const pageLimited=new ManualBackfillManager({databasePath:test.path,runAlbamon:vi.fn(async()=>sourceResult(5,[albamonPage(1)])) as never,
      loadPersonalProfile:()=>personalProfileState(),now:()=>new Date("2026-08-11T01:00:00Z")});
    const incomplete=await completed(pageLimited,pageLimited.start({...albamonConfig,maxPages:1,mode:"dry_run"}).id);
    expect(incomplete.result).toMatchObject({stopReason:"page_limit",fullExhausted:false});expect(incomplete.writeAuthorizationToken).toBeNull();
    const parserFailed=new ManualBackfillManager({databasePath:test.path,runAlbamon:vi.fn(async()=>sourceResult(5,[albamonPage(1,{exhausted:true,parserFailure:true})])) as never,
      loadPersonalProfile:()=>personalProfileState(),now:()=>new Date("2026-08-11T01:00:00Z")});
    const invalid=await completed(parserFailed,parserFailed.start({...albamonConfig,mode:"dry_run"}).id);
    expect(invalid.result).toMatchObject({parserErrors:1,fullExhausted:false});expect(invalid.writeAuthorizationToken).toBeNull();
  });

  it("expires authorization after 30 minutes and binds it to max pages and the canonical profile hash", async () => {
    test=createTestDatabase();let current=new Date("2026-08-11T01:00:00Z"),profile=personalProfileState();
    const manager=new ManualBackfillManager({databasePath:test.path,runAlbamon:vi.fn(async()=>sourceResult()) as never,
      createBackup:vi.fn(async()=>({filePath:"ignored.sqlite",manifestPath:"ignored.json",manifest:{}})) as never,
      loadPersonalProfile:()=>profile,now:()=>current});
    const preview=await completed(manager,manager.start({...albamonConfig,mode:"dry_run"}).id);
    expect(()=>manager.start({...albamonConfig,maxPages:100,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"})).toThrow();
    profile=personalProfileState(exclusion.keywords,"SORT_OR_PROFILE_HASH_CHANGED");
    expect(()=>manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"})).toThrow();
    profile=personalProfileState();current=new Date("2026-08-11T01:30:00.001Z");
    expect(()=>manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"})).toThrow();
  });

  it("consumes authorization before a failed write and cannot reuse it", async () => {
    test=createTestDatabase();let calls=0;
    const source=vi.fn(async()=>{calls+=1;if(calls===2)throw new Error("synthetic write failure");return sourceResult();});
    const manager=new ManualBackfillManager({databasePath:test.path,runAlbamon:source as never,
      createBackup:vi.fn(async()=>({filePath:"ignored.sqlite",manifestPath:"ignored.json",manifest:{}})) as never,
      loadPersonalProfile:()=>personalProfileState(),now:()=>new Date("2026-08-11T01:00:00Z")});
    const preview=await completed(manager,manager.start({...albamonConfig,mode:"dry_run"}).id);
    const failed=await completed(manager,manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"}).id);
    expect(failed.status).toBe("failed");
    expect(()=>manager.start({...albamonConfig,mode:"write",writeAuthorizationToken:preview.writeAuthorizationToken!,confirmationPhrase:"BACKFILL albamon ALL"})).toThrow();
  });

  it("cancels a long run between pages and keeps the exclusive run lock", async () => {
    test = createTestDatabase();
    const source = vi.fn(async (options: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("cancelled");
    });
    const first = new ManualBackfillManager({ databasePath: test.path, runAlbamon: source as never,
      loadPersonalProfile: () => personalProfileState(), now: () => new Date("2026-08-11T01:00:00Z") });
    const second = new ManualBackfillManager({ databasePath: test.path, runAlbamon: source as never,
      loadPersonalProfile: () => personalProfileState(), now: () => new Date("2026-08-11T01:00:00Z") });
    const run = first.start({ ...albamonConfig, maxPages: 300, mode: "dry_run" });
    expect(() => second.start({ ...albamonConfig, maxPages: 300, mode: "dry_run" })).toThrow();
    expect(first.cancel(run.id)?.status).toBe("cancelled");
    expect((await completed(first, run.id)).status).toBe("cancelled");
  });

  it("rejects an Albamon run before transport when the server profile is unconfigured", () => {
    const source = vi.fn();
    const manager = new ManualBackfillManager({ runAlbamon: source as never,
      loadPersonalProfile: () => ({ configured: false, profile: null, profileHash: null }) });
    expect(() => manager.start({ ...albamonConfig, mode: "dry_run" })).toThrow("서버에 설정되지 않았습니다");
    expect(source).not.toHaveBeenCalled();
  });
});

async function completed(manager: ManualBackfillManager, id: string): Promise<ManualBackfillSnapshot> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = manager.get(id)!;
    if (["completed", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("test run timeout");
}
