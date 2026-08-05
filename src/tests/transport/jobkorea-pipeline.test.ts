import { afterEach, describe, expect, it, vi } from "vitest";
import { JobRepository } from "../../db/repositories/job-repository";
import { getDatabaseStatus } from "../../db/database-status";
import { JobKoreaHttpClient } from "../../sources/jobkorea/transport/jobkorea-http-client";
import { runJobKoreaOneShot } from "../../sources/jobkorea/transport/jobkorea-one-shot-transport";
import type { JobKoreaFetch } from "../../sources/jobkorea/transport/types";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { detailHtml, htmlResponse, listingHtml, robotsAllow, robotsBlock } from "./jobkorea-test-responses";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const listingUrl = "https://www.jobkorea.co.kr/Search/?stext=test";
const options = (overrides: Partial<{ maxDetails: 1 | 2 | 3; dryRun: boolean }> = {}) => ({ listingUrl, maxDetails: overrides.maxDetails ?? 3, confirm: true as const, dryRun: overrides.dryRun ?? false });

function queuedFetch(responses: Array<() => Response>, calls: string[] = []): JobKoreaFetch {
  return vi.fn(async (input) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("unexpected HTTP request");
    return next();
  });
}

function pipeline(responses: Array<() => Response>, runOptions = options(), calls: string[] = []) {
  testDatabase = createTestDatabase();
  return runJobKoreaOneShot(runOptions, { database: testDatabase.database, httpClient: new JobKoreaHttpClient(queuedFetch(responses, calls)),
    now: () => new Date("2026-08-05T00:00:00Z") });
}

describe("잡코리아 mocked one-shot pipeline", () => {
  it("목록 1회와 상세 3회를 순차 처리해 CanonicalJob 3건을 적재한다", async () => {
    const calls: string[] = [];
    const result = await pipeline([robotsAllow, () => htmlResponse(listingHtml()), () => htmlResponse(detailHtml("101")),
      () => htmlResponse(detailHtml("102")), () => htmlResponse(detailHtml("103"))], options(), calls);
    expect(result).toMatchObject({ status: "completed", preflightRequests: 1, contentRequests: 4, listingRequests: 1, detailRequests: 3, inserted: 3, failed: 0 });
    expect(calls).toHaveLength(5);
    expect(new JobRepository(testDatabase!.database).listAll()).toHaveLength(3);
    const run = testDatabase!.database.prepare("SELECT status, content_request_count, selected_detail_count FROM ingestion_runs WHERE id = ?").get(result.runId) as Record<string, unknown>;
    expect(run).toEqual({ status: "completed", content_request_count: 4, selected_detail_count: 3 });
    expect(getDatabaseStatus(testDatabase!.database, testDatabase!.path)).toMatchObject({ oneShotObserved: 3,
      latestOneShotRun: { id: result.runId, status: "completed", permissionStatus: "unverified" } });
  });

  it("차단된 한 상세를 대체할 네 번째 후보를 요청하지 않고 partial로 끝낸다", async () => {
    const calls: string[] = [];
    const blocked = () => htmlResponse("<!doctype html><p>CAPTCHA 자동입력 방지</p>");
    const result = await pipeline([robotsAllow, () => htmlResponse(listingHtml(["101", "102", "103", "104"])),
      () => htmlResponse(detailHtml("101")), blocked, () => htmlResponse(detailHtml("103"))], options(), calls);
    expect(result).toMatchObject({ status: "partial", selectedCandidates: 3, inserted: 2, blocked: 1, contentRequests: 4 });
    expect(calls.some((call) => call.includes("104"))).toBe(false);
  });

  it("malformed 상세 하나가 다른 정상 상세를 무효화하지 않는다", async () => {
    const malformed = () => htmlResponse("<!doctype html><p>마감되었습니다</p>");
    const result = await pipeline([robotsAllow, () => htmlResponse(listingHtml()), () => htmlResponse(detailHtml("101")), malformed, () => htmlResponse(detailHtml("103"))]);
    expect(result).toMatchObject({ status: "partial", inserted: 2, failed: 1 });
    expect(result.diagnostics.map(({ code }) => code)).toContain("JOBKOREA_DETAIL_PARSER_FAILURE");
  });

  it("동일 run은 unchanged이고 변경된 의미 내용은 update한다", async () => {
    testDatabase = createTestDatabase();
    const execute = (title: string) => runJobKoreaOneShot(options({ maxDetails: 1 }), { database: testDatabase!.database,
      httpClient: new JobKoreaHttpClient(queuedFetch([robotsAllow, () => htmlResponse(listingHtml(["101"])), () => htmlResponse(detailHtml("101", title))])),
      now: () => new Date("2026-08-05T00:00:00Z") });
    expect(await execute("동일 제목")).toMatchObject({ inserted: 1 });
    expect(await execute("동일 제목")).toMatchObject({ unchanged: 1 });
    expect(await execute("변경 제목")).toMatchObject({ updated: 1 });
    expect(new JobRepository(testDatabase.database).listAll()).toHaveLength(1);
  });

  it("dry-run은 jobs·children·ingestion run을 전혀 쓰지 않고 예상 action만 출력한다", async () => {
    const result = await pipeline([robotsAllow, () => htmlResponse(listingHtml(["101"])), () => htmlResponse(detailHtml("101"))], options({ maxDetails: 1, dryRun: true }));
    expect(result).toMatchObject({ runId: null, inserted: 1, dryRun: true });
    for (const table of ["jobs", "workplaces", "job_categories", "job_employment_types", "ingestion_runs"]) {
      expect((testDatabase!.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count).toBe(0);
    }
  });

  it("dry-run은 기존 source record도 갱신하거나 provenance를 추가하지 않는다", async () => {
    testDatabase = createTestDatabase();
    const repository = new JobRepository(testDatabase.database);
    repository.upsert(canonicalJob({ id: "jobkorea:101", sourcePostingId: "101", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101", canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101" }),
      { recordKind: "fixture_derived", evidenceType: "observed_json_ld", sourceFixtureReference: "fixture:101", mapPosition: null });
    const before = testDatabase.database.serialize();
    await runJobKoreaOneShot(options({ maxDetails: 1, dryRun: true }), { database: testDatabase.database,
      httpClient: new JobKoreaHttpClient(queuedFetch([robotsAllow, () => htmlResponse(listingHtml(["101"])), () => htmlResponse(detailHtml("101", "변경 후보"))])),
      now: () => new Date("2026-08-05T00:00:00Z") });
    expect(testDatabase.database.serialize()).toEqual(before);
  });

  it("robots disallow는 listing/detail 요청 0회로 blocked run을 기록한다", async () => {
    const calls: string[] = [];
    const result = await pipeline([robotsBlock], options({ maxDetails: 1 }), calls);
    expect(result).toMatchObject({ status: "blocked", preflightRequests: 1, contentRequests: 0, listingRequests: 0, blocked: 1 });
    expect(calls).toHaveLength(1);
    expect(testDatabase!.database.prepare("SELECT status, blocked_count FROM ingestion_runs WHERE id = ?").get(result.runId)).toEqual({ status: "blocked", blocked_count: 1 });
  });

  it("listing 오류는 failed run과 실제 request count를 기록한다", async () => {
    const result = await pipeline([robotsAllow, () => htmlResponse("<!doctype html><p>후보 없음</p>")], options({ maxDetails: 1 }));
    expect(result).toMatchObject({ status: "failed", contentRequests: 1, failed: 1, selectedCandidates: 0 });
    expect(testDatabase!.database.prepare("SELECT status, content_request_count FROM ingestion_runs WHERE id = ?").get(result.runId))
      .toEqual({ status: "failed", content_request_count: 1 });
  });

  it("fixture provenance를 지우지 않고 one-shot provenance를 추가한다", async () => {
    testDatabase = createTestDatabase();
    const repository = new JobRepository(testDatabase.database);
    repository.upsert(canonicalJob({ id: "jobkorea:101", sourcePostingId: "101", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101", canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101" }),
      { recordKind: "fixture_derived", evidenceType: "observed_json_ld", sourceFixtureReference: "fixture:101", mapPosition: null });
    await runJobKoreaOneShot(options({ maxDetails: 1 }), { database: testDatabase.database,
      httpClient: new JobKoreaHttpClient(queuedFetch([robotsAllow, () => htmlResponse(listingHtml(["101"])), () => htmlResponse(detailHtml("101"))])),
      now: () => new Date("2026-08-05T00:00:00Z") });
    const kinds = (testDatabase.database.prepare("SELECT provenance_kind FROM job_provenance_history WHERE job_id = ? ORDER BY provenance_kind").all("jobkorea:101") as Array<{ provenance_kind: string }>).map(({ provenance_kind }) => provenance_kind);
    expect(kinds).toEqual(["fixture_derived", "live_one_shot_observation"]);
    expect(repository.listUiRecords().records[0]).toMatchObject({ provenanceKind: "live_one_shot_observation", observedAt: "2026-08-05T00:00:00.000Z" });
  });

  it("중복 후보를 제거하고 목록 순서대로 최대 개수만 선택한다", async () => {
    const result = await pipeline([robotsAllow, () => htmlResponse(listingHtml(["101", "101", "102", "103"])),
      () => htmlResponse(detailHtml("101")), () => htmlResponse(detailHtml("102"))], options({ maxDetails: 2 }));
    expect(result).toMatchObject({ selectedCandidates: 2, rejectedCandidates: 1, inserted: 2, detailRequests: 2 });
    expect(result.details.map(({ sourcePostingId }) => sourcePostingId)).toEqual(["101", "102"]);
  });

  it("모든 HTTP 요청을 동시 실행하지 않고 순차 처리한다", async () => {
    testDatabase = createTestDatabase();
    const responses = [robotsAllow, () => htmlResponse(listingHtml(["101", "102", "103"])),
      () => htmlResponse(detailHtml("101")), () => htmlResponse(detailHtml("102")), () => htmlResponse(detailHtml("103"))];
    let active = 0; let maximumActive = 0;
    const fetchSequential: JobKoreaFetch = async () => {
      active += 1; maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return responses.shift()!();
    };
    await runJobKoreaOneShot(options(), { database: testDatabase.database, httpClient: new JobKoreaHttpClient(fetchSequential), now: () => new Date("2026-08-05T00:00:00Z") });
    expect(maximumActive).toBe(1);
  });
});
