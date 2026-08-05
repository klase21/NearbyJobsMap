import { afterEach, describe, expect, it, vi } from "vitest";
import { JobRepository } from "../../db/repositories/job-repository";
import { JobKoreaHttpClient } from "../../sources/jobkorea/transport/jobkorea-http-client";
import { buildJobKoreaListingPageResult } from "../../sources/jobkorea/transport/jobkorea-listing-page";
import { runJobKoreaSearchOneShot } from "../../sources/jobkorea/transport/jobkorea-search-one-shot";
import type { JobKoreaListingPageResult, JobKoreaRenderedPageSnapshot, JobKoreaSearchExecution, JobKoreaSearchOptions } from "../../sources/jobkorea/transport/jobkorea-search-types";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import { detailHtml, robotsAllow } from "./jobkorea-test-responses";

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const searchUrl = "https://www.jobkorea.co.kr/Search?stext=AI&tabType=recruit&Page_No=1";
const options = (overrides: Partial<JobKoreaSearchOptions> = {}): JobKoreaSearchOptions => ({ searchUrl, pages: 1, maxDetails: 3,
  transport: "playwright", confirm: true, dryRun: false, diagnostic: false, ...overrides });
const directVerification = { classification: "direct_endpoint_unavailable" as const, observation: null,
  diagnostic: { severity: "warning" as const, code: "JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", field: null, message: "미관찰" } };

function page(ids: string[], pageNumber = 1, globalSeen = new Set<string>()): JobKoreaListingPageResult {
  const snapshot: JobKoreaRenderedPageSnapshot = { finalUrl: `${searchUrl.replace("Page_No=1", `Page_No=${pageNumber}`)}`, title: "검색", bodyText: "검색 결과",
    sourceReportsNoResults: false, directObservation: null, anchors: ids.map((id) => ({ href: `/Recruit/GI_Read/${id}`, title: `공고 ${id}`,
      companyName: `회사 ${id}`, containerText: `공고 ${id}`, dataGno: id, ordinaryContainer: true, promotedEvidence: false, recommendationEvidence: false })) };
  return buildJobKoreaListingPageResult(snapshot, pageNumber, globalSeen);
}

class FakeExecution implements JobKoreaSearchExecution {
  readonly transportUsed = "playwright" as const;
  readonly consoleErrors: string[] = [];
  readonly lifecycleDiagnostics = [];
  readonly directVerification = directVerification;
  readonly directRequestCount = 0;
  detailNavigationCount = 0;
  closed = false;
  constructor(readonly pages: JobKoreaListingPageResult[], private readonly responses: Array<string | Error>) {}
  get searchNavigationCount(): number { return this.pages.length; }
  async fetchDetail(url: string) {
    this.detailNavigationCount += 1;
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("unexpected detail request");
    return { finalUrl: url, html: response, explicitClosed: false };
  }
  async close() { this.closed = true; }
}

function robotsClient() {
  return new JobKoreaHttpClient(vi.fn(async () => robotsAllow()));
}

describe("잡코리아 browser search → parser → SQLite pipeline", () => {
  it("세 후보를 sanitizer·기존 parser·CanonicalJob으로 처리해 적재한다", async () => {
    testDatabase = createTestDatabase();
    const execution = new FakeExecution([page(["101", "102", "103"])], [detailHtml("101"), detailHtml("102"), detailHtml("103")]);
    const result = await runJobKoreaSearchOneShot(options(), { database: testDatabase.database, httpClient: robotsClient(), createExecution: async () => execution,
      now: () => new Date("2026-08-05T00:00:00Z") });
    expect(result).toMatchObject({ status: "completed", searchNavigations: 1, detailNavigations: 3, inserted: 3, failed: 0 });
    expect(new JobRepository(testDatabase.database).listAll()).toHaveLength(3);
    expect(execution.closed).toBe(true);
    expect(testDatabase.database.prepare("SELECT observation_kind, observation_transport, observation_page_number, observation_listing_position FROM jobs WHERE source_posting_id = '101'").get())
      .toEqual({ observation_kind: "bounded_public_browser_observation", observation_transport: "playwright", observation_page_number: 1, observation_listing_position: 1 });
    expect(testDatabase.database.prepare("SELECT observation_kind, observation_transport, page_number, listing_position FROM job_provenance_history WHERE job_id = 'jobkorea:101'").get())
      .toEqual({ observation_kind: "bounded_public_browser_observation", observation_transport: "playwright", page_number: 1, listing_position: 1 });
  });

  it("반복 동일 run은 unchanged이고 의미 내용 변경은 update한다", async () => {
    testDatabase = createTestDatabase();
    const execute = (title: string) => runJobKoreaSearchOneShot(options({ maxDetails: 1 }), { database: testDatabase!.database, httpClient: robotsClient(),
      createExecution: async () => new FakeExecution([page(["101"])], [detailHtml("101", title)]), now: () => new Date("2026-08-05T00:00:00Z") });
    expect(await execute("동일 제목")).toMatchObject({ inserted: 1 });
    expect(await execute("동일 제목")).toMatchObject({ unchanged: 1 });
    expect(await execute("변경 제목")).toMatchObject({ updated: 1 });
    expect(new JobRepository(testDatabase.database).listAll()).toHaveLength(1);
  });

  it("dry-run은 파일 내용에 대응하는 SQLite serialization을 변경하지 않는다", async () => {
    testDatabase = createTestDatabase();
    const before = testDatabase.database.serialize();
    const result = await runJobKoreaSearchOneShot(options({ maxDetails: 1, dryRun: true }), { database: testDatabase.database,
      httpClient: robotsClient(), createExecution: async () => new FakeExecution([page(["101"])], [detailHtml("101")]), now: () => new Date("2026-08-05T00:00:00Z") });
    expect(result).toMatchObject({ runId: null, inserted: 1 });
    expect(testDatabase.database.serialize()).toEqual(before);
  });

  it("한 상세 실패가 정상 상세를 무효화하거나 replacement를 요청하지 않는다", async () => {
    testDatabase = createTestDatabase();
    const execution = new FakeExecution([page(["101", "102", "103", "104"])], [detailHtml("101"), new Error("malformed"), detailHtml("103")]);
    const result = await runJobKoreaSearchOneShot(options(), { database: testDatabase.database, httpClient: robotsClient(), createExecution: async () => execution,
      now: () => new Date("2026-08-05T00:00:00Z") });
    expect(result).toMatchObject({ status: "partial", selectedCandidates: 3, inserted: 2, failed: 1, detailNavigations: 3 });
    expect(result.details.some(({ sourcePostingId }) => sourcePostingId === "104")).toBe(false);
  });

  it("page 1·2 overlap은 전역 dedup하되 page 2 emptiness를 바꾸지 않는다", async () => {
    testDatabase = createTestDatabase();
    const seen = new Set<string>();
    const pages = [page(["101", "102"], 1, seen), page(["102", "103"], 2, seen)];
    const execution = new FakeExecution(pages, [detailHtml("101"), detailHtml("102"), detailHtml("103")]);
    const result = await runJobKoreaSearchOneShot(options({ pages: 2 }), { database: testDatabase.database, httpClient: robotsClient(), createExecution: async () => execution,
      now: () => new Date("2026-08-05T00:00:00Z") });
    expect(result).toMatchObject({ globalDuplicateCount: 1, selectedCandidates: 3 });
    expect(result.pageResults[1]).toMatchObject({ classification: "valid_search_results", validEmptyPage: false, uniqueNewCount: 1 });
  });

  it("max-details 0은 listing-link validation만 하고 detail이나 DB write를 만들지 않는다", async () => {
    testDatabase = createTestDatabase();
    const execution = new FakeExecution([page(["101"])], []);
    const before = testDatabase.database.serialize();
    const result = await runJobKoreaSearchOneShot(options({ maxDetails: 0, dryRun: true }), { database: testDatabase.database,
      httpClient: robotsClient(), createExecution: async () => execution });
    expect(result).toMatchObject({ selectedCandidates: 0, detailNavigations: 0, inserted: 0 });
    expect(testDatabase.database.serialize()).toEqual(before);
  });

  it("browser 실행 생성 실패도 throw 대신 구조화된 실패 결과를 반환한다", async () => {
    testDatabase = createTestDatabase();
    const result = await runJobKoreaSearchOneShot(options({ maxDetails: 0, dryRun: true, diagnostic: true }), {
      database: testDatabase.database,
      httpClient: robotsClient(),
      createExecution: async () => { throw new Error("synthetic launch failure"); },
    });
    expect(result).toMatchObject({ status: "failed", dryRun: true, selectedCandidates: 0, detailNavigations: 0, internalBudgetMs: 40_000 });
    expect(result.pageResults[0]).toMatchObject({ classification: "unexpected_page", validEmptyPage: false });
    expect(result.consoleErrors[0]).toContain("JOBKOREA_SEARCH_COMMAND_FAILED");
  });
});
