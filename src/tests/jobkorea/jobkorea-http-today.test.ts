import { describe, expect, it, vi } from "vitest";
import { classifyPostingDateEvidenceAt } from "../../services/collection-date";
import {
  buildJobKoreaTodayForm,
  createJobKoreaHttpTodayExecution,
  JOBKOREA_TODAY_ENDPOINT,
  extractJobKoreaListingMetadataCells,
  isJobKoreaListingSalaryDisplay,
  parseJobKoreaHttpTodayPage,
} from "../../sources/jobkorea/today/jobkorea-http-today";
import { jobKoreaHttpTodayFixture } from "../fixtures/jobkorea-http-today-fixture";

const observedAt = "2026-08-07T01:00:00.000Z"; // 10:00 KST
const runDate = "2026-08-07";

describe("JobKorea HTTP TODAY request contract", () => {
  it("uses the verified form contract and increments explicit pages", () => {
    expect(Object.fromEntries(buildJobKoreaTodayForm(7))).toEqual({ isDefault: "true", "condition[local]": "I000,B000",
      "condition[menucode]": "", page: "7", direct: "0", order: "2", pagesize: "50", tabindex: "0", onePick: "0", confirm: "0", profile: "0" });
  });

  it("POSTs without cookies, Playwright, details, BFF, or retries", async () => {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init: init! });
      return new Response(jobKoreaHttpTodayFixture([{ id: "81000001", registration: "24 분 전 등록" }]),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    });
    const execution = await createJobKoreaHttpTodayExecution({ searchUrl: JOBKOREA_TODAY_ENDPOINT, pages: 1, pageNumbers: [1], maxDetails: 0,
      transport: "direct", confirm: true, dryRun: true, diagnostic: false, localTodayMode: true,
      collectionDate: { timezone: "Asia/Seoul", resolvedDate: runDate } }, { fetchImplementation, now: () => new Date(observedAt) });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe(JOBKOREA_TODAY_ENDPOINT);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.redirect).toBe("manual");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded; charset=UTF-8");
    expect(headers.get("origin")).toBe("https://www.jobkorea.co.kr");
    expect(headers.get("referer")).toContain("/recruit/joblist?");
    expect(headers.get("x-requested-with")).toBe("XMLHttpRequest");
    expect(headers.has("cookie")).toBe(false);
    expect(String(calls[0]!.init.body)).toContain("condition%5Blocal%5D=I000%2CB000");
    expect(execution).toMatchObject({ transportUsed: "http_post_listing", searchNavigationCount: 0, detailNavigationCount: 0,
      directRequestCount: 1, completedByExhaustion: true, stopReason: "hard_limit" });
    await expect(execution.fetchDetail("https://www.jobkorea.co.kr/Recruit/GI_Read/81000001")).rejects.toThrow(/never requests detail/i);
  });
});

describe("JobKorea HTTP TODAY parser", () => {
  it.each([
    ["A", "신입 ·경력", "학력무관", "서울 강남구 외", "정규직 외", "270~300만원(월)", "팀원"],
    ["B", "경력무관", "학력무관", "경기 안양시", "정규직", "4,516만원 이상", ""],
    ["C", "신입", "대졸↑", "서울 강동구", "정규직", "4,750만원 이상", ""],
    ["D", "경력3년↑", "학력무관", "경기 파주시 외", "계약직", "260~270만원(월)", "팀원"],
    ["E", "신입 ·경력", "학력무관", "서울 마포구", "정규직", "", ""],
    ["F", "신입 ·경력", "학력무관", "서울", "정규직", "", "사원급"],
  ])("preserves the six-cell metadata contract for fixture %s", (_case, experience, education, location, employment, salary, positionGrade) => {
    const html = jobKoreaHttpTodayFixture([{ id: `8150000${_case.charCodeAt(0)}`, registration: "5분 전 등록",
      experience, education, location, employment, salary, positionGrade }]);
    const candidate = parseJobKoreaHttpTodayPage(html, 1, observedAt).result.collectionCandidates?.[0];
    expect(candidate?.listingFields).toMatchObject({ experienceRequirement: experience, educationRequirement: education,
      regionText: location, employmentTypes: [employment], salaryText: salary || null, positionGrade: positionGrade || null,
      salaryCandidateRejected: false });
  });

  it("does not shift position/grade into an empty salary cell", () => {
    const html = jobKoreaHttpTodayFixture([{ id: "81500999", registration: "5분 전 등록", salary: "", positionGrade: "사원급" }]);
    const metadata = extractJobKoreaListingMetadataCells(html);
    const fields = parseJobKoreaHttpTodayPage(html, 1, observedAt).result.collectionCandidates?.[0]?.listingFields;
    expect(metadata.cells).toEqual(["경력무관", "학력무관", "서울 강남구", "정규직", "", "사원급"]);
    expect(metadata).toMatchObject({ salary: null, positionGrade: "사원급", salaryCandidateRejected: false });
    expect(fields).toMatchObject({ salaryText: null, positionGrade: "사원급", regionText: "서울 강남구", employmentTypes: ["정규직"] });
  });

  it("rejects non-compensation text in the dedicated salary position", () => {
    const html = jobKoreaHttpTodayFixture([{ id: "81500998", registration: "5분 전 등록", salary: "사원급", positionGrade: "대리급" }]);
    const fields = parseJobKoreaHttpTodayPage(html, 1, observedAt).result.collectionCandidates?.[0]?.listingFields;
    expect(isJobKoreaListingSalaryDisplay("사원급")).toBe(false);
    expect(fields).toMatchObject({ salaryText: null, positionGrade: "대리급", salaryCandidateRejected: true });
  });

  it("parses the 50-row structural contract and keeps registration separate from deadline", () => {
    const html = jobKoreaHttpTodayFixture(Array.from({ length: 50 }, (_, index) => ({ id: String(82000000 + index),
      registration: index === 0 ? '<span class="tahoma">24</span> 분 전 등록' : `${25 + index}분 전 등록`,
      deadline: index === 0 ? "오늘 마감" : "08/20 마감", location: index % 2 ? "경기 성남시" : "서울 강남구" })));
    const parsed = parseJobKoreaHttpTodayPage(html, 1, observedAt);
    expect(parsed).toMatchObject({ rowCount: 50, result: { classification: "valid_search_results", ordinaryPostingCount: 50,
      rejectedCandidateCount: 0, duplicateWithinPageCount: 0, uniqueNewCount: 50 } });
    expect(parsed.result.collectionCandidates).toHaveLength(50);
    expect(parsed.result.collectionCandidates?.[0]).toMatchObject({ postingId: "82000000",
      canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/82000000", listingFields: {
        title: "가상 공고 82000000", companyName: "가상회사 82000000", regionText: "서울 강남구", salaryText: "월급 300만원",
        employmentTypes: ["정규직"], experienceRequirement: "경력무관", educationRequirement: "학력무관",
        postedAt: "24분 전 등록", postingDateEvidence: { raw: "24분 전 등록", kind: "relative_age", sourceField: "listing_registered" },
        deadlineText: "오늘 마감" } });
  });

  it("rejects ID mismatches, isolates the main result root, and ignores deadline-only evidence", () => {
    const main = jobKoreaHttpTodayFixture([{ id: "83000001", registration: "", deadline: "오늘 마감" }]);
    const promoted = '<aside><tr class="devloopArea" data-gno="99999999"><td class="tplTit"><strong><a href="/Recruit/GI_Read/99999999">추천</a></strong></td></tr></aside>';
    const mismatch = main.replace("/Recruit/GI_Read/83000001", "/Recruit/GI_Read/83000002");
    const parsed = parseJobKoreaHttpTodayPage(promoted + mismatch, 1, observedAt);
    expect(parsed.result.collectionCandidates).toEqual([]);
    expect(parsed.result.rejectedCandidateCount).toBe(1);
    expect(parsed.result.classification).toBe("malformed_results");
    const deadlineOnly = parseJobKoreaHttpTodayPage(promoted + main, 1, observedAt).result.collectionCandidates?.[0];
    expect(deadlineOnly?.listingFields?.postingDateEvidence).toEqual({ raw: null, kind: "unknown", sourceField: "listing_registered" });
  });

  it.each([
    ["24 분 전 등록", "today", false], ["5시간 전 등록", "today", false], ["9시간 전 등록", "unknown", true],
    ["10시간 전 등록", "older", false], ["1일 전 등록", "older", false], ["07/22 등록", "older", false],
  ])("classifies %s conservatively", (raw, status, midnightAmbiguous) => {
    const parsed = parseJobKoreaHttpTodayPage(jobKoreaHttpTodayFixture([{ id: "84000001", registration: raw }]), 1, observedAt);
    const evidence = parsed.result.collectionCandidates?.[0]?.listingFields?.postingDateEvidence?.raw;
    expect(classifyPostingDateEvidenceAt(evidence, observedAt, runDate)).toMatchObject({ status, midnightAmbiguous });
  });
});

describe("JobKorea HTTP TODAY pagination", () => {
  const options = (pages: number) => ({ searchUrl: JOBKOREA_TODAY_ENDPOINT, pages, pageNumbers: Array.from({ length: pages }, (_, index) => index + 1),
    maxDetails: 0, transport: "direct" as const, confirm: true as const, dryRun: true, diagnostic: false,
    localTodayMode: true, collectionDate: { timezone: "Asia/Seoul" as const, resolvedDate: runDate } });

  it("stops after one complete all-older page but fully classifies a mixed page", async () => {
    const bodies = [jobKoreaHttpTodayFixture([{ id: "85000001", registration: "5분 전 등록" }, { id: "85000002", registration: "1일 전 등록" }]),
      jobKoreaHttpTodayFixture([{ id: "85000003", registration: "1일 전 등록" }]), jobKoreaHttpTodayFixture([{ id: "85000004", registration: "1일 전 등록" }])];
    let index = 0;
    const execution = await createJobKoreaHttpTodayExecution(options(3), { now: () => new Date(observedAt),
      fetchImplementation: async () => new Response(bodies[index++]!, { status: 200, headers: { "content-type": "text/html" } }) });
    expect(execution.pages).toHaveLength(2);
    expect(execution.stopReason).toBe("older_page");
  });

  it("does not stop on a duplicate-only page and stops on a repeated fingerprint", async () => {
    const first = jobKoreaHttpTodayFixture([{ id: "86000001", registration: "5분 전 등록" }]);
    const second = jobKoreaHttpTodayFixture([{ id: "86000001", registration: "5분 전 등록" }]);
    let index = 0;
    const execution = await createJobKoreaHttpTodayExecution(options(3), { now: () => new Date(observedAt),
      fetchImplementation: async () => new Response([first, second][index++]!, { status: 200, headers: { "content-type": "text/html" } }) });
    expect(execution.pages).toHaveLength(2);
    expect(execution.pages[1]?.uniqueNewCount).toBe(0);
    expect(execution.stopReason).toBe("repeated_page");
  });

  it("stops on zero valid rows and respects the requested hard limit", async () => {
    const malformed = '<div class="tplJobListWrap"><table><caption>전체 채용정보 목록</caption><tr class="devloopArea" data-gno="bad"></tr></table></div>';
    const zero = await createJobKoreaHttpTodayExecution(options(2), { now: () => new Date(observedAt),
      fetchImplementation: async () => new Response(malformed, { status: 200, headers: { "content-type": "text/html" } }) });
    expect(zero).toMatchObject({ stopReason: "zero_valid_rows", completedByExhaustion: false });
    const one = await createJobKoreaHttpTodayExecution(options(1), { now: () => new Date(observedAt),
      fetchImplementation: async () => new Response(jobKoreaHttpTodayFixture([{ id: "87000001", registration: "방금" }]), { status: 200, headers: { "content-type": "text/html" } }) });
    expect(one).toMatchObject({ stopReason: "hard_limit", completedByExhaustion: true, directRequestCount: 1 });
  });

  it("stops a historical backfill at the cutoff before its 300-page ceiling", async () => {
    const bodies = [
      jobKoreaHttpTodayFixture([{ id: "88000001", registration: "1일 전 등록" }]),
      jobKoreaHttpTodayFixture([{ id: "88000002", registration: "4일 전 등록" }]),
    ];
    let index = 0;
    const { collectionDate: _collectionDate, ...historicalOptions } = options(300);
    void _collectionDate;
    const execution = await createJobKoreaHttpTodayExecution({ ...historicalOptions, backfillCutoffDate: "2026-08-05" }, {
      now: () => new Date(observedAt),
      fetchImplementation: async () => new Response(bodies[index++]!, { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(execution).toMatchObject({ stopReason: "older_page", completedByExhaustion: true, directRequestCount: 2 });
    expect(execution.pages).toHaveLength(2);
  });

  it("stops at the selected historical page ceiling when the cutoff is not reached", async () => {
    let index = 0;
    const { collectionDate: _collectionDate, ...historicalOptions } = options(3);
    void _collectionDate;
    const execution = await createJobKoreaHttpTodayExecution({ ...historicalOptions, backfillCutoffDate: "2026-08-01" }, {
      now: () => new Date(observedAt),
      fetchImplementation: async () => new Response(jobKoreaHttpTodayFixture([{ id: String(89000000 + index++), registration: "1일 전 등록" }]), { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(execution).toMatchObject({ stopReason: "hard_limit", completedByExhaustion: true, directRequestCount: 3 });
  });
});
