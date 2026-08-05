import { describe, expect, it, vi } from "vitest";
import { getJobKoreaHttpClientConfig, JobKoreaHttpClient, JOBKOREA_USER_AGENT } from "../../sources/jobkorea/transport/jobkorea-http-client";
import { JobKoreaRequestBudget } from "../../sources/jobkorea/transport/jobkorea-request-budget";
import { htmlResponse } from "./jobkorea-test-responses";

const listing = "https://www.jobkorea.co.kr/Search/?stext=test";

describe("잡코리아 bounded HTTP client", () => {
  it("cross-domain redirect와 redirect limit을 거부한다", async () => {
    const cross = new JobKoreaHttpClient(vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } })));
    await expect(cross.request(listing, "listing", new JobKoreaRequestBudget())).rejects.toMatchObject({ code: "JOBKOREA_REDIRECT_REJECTED" });
    const looping = new JobKoreaHttpClient(vi.fn(async () => new Response(null, { status: 302, headers: { location: listing } })));
    await expect(looping.request(listing, "listing", new JobKoreaRequestBudget())).rejects.toMatchObject({ code: "JOBKOREA_REDIRECT_REJECTED" });
  });
  it("timeout을 별도 진단하고 재시도하지 않는다", async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const client = new JobKoreaHttpClient(fetchMock, { timeoutMs: 5, maxResponseBytes: 1024 });
    await expect(client.request(listing, "listing", new JobKoreaRequestBudget())).rejects.toMatchObject({ code: "JOBKOREA_TRANSPORT_TIMEOUT" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("Content-Length와 streaming 크기 한도를 적용한다", async () => {
    const advertised = new JobKoreaHttpClient(vi.fn(async () => htmlResponse("small", 200, { "content-length": "5000" })), { timeoutMs: 100, maxResponseBytes: 100 });
    await expect(advertised.request(listing, "listing", new JobKoreaRequestBudget())).rejects.toMatchObject({ code: "JOBKOREA_RESPONSE_TOO_LARGE" });
    const streamed = new JobKoreaHttpClient(vi.fn(async () => htmlResponse("x".repeat(101))), { timeoutMs: 100, maxResponseBytes: 100 });
    await expect(streamed.request(listing, "listing", new JobKoreaRequestBudget())).rejects.toMatchObject({ code: "JOBKOREA_RESPONSE_TOO_LARGE" });
  });
  it("쿠키·인증·referrer 없이 고정 browser-like User-Agent와 공개 페이지 헤더를 보낸다", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => htmlResponse("<!doctype html><a href='/Recruit/GI_Read/1'>x</a>"));
    await new JobKoreaHttpClient(fetchMock).request(listing, "listing", new JobKoreaRequestBudget());
    const init = fetchMock.mock.calls[0]?.[1];
    if (!init) throw new Error("request init missing");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({ "user-agent": JOBKOREA_USER_AGENT, "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6",
      "cache-control": "no-cache", pragma: "no-cache" });
    expect(JOBKOREA_USER_AGENT).toMatch(/Mozilla\/5\.0.*NearbyJobsMap\/0\.1/);
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|authorization|referer/i);
  });
  it("로그인 redirect의 sanitized target, status, count와 chain을 보존한다", async () => {
    const detail = "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001";
    const client = new JobKoreaHttpClient(vi.fn(async () => new Response(null, { status: 302,
      headers: { location: "https://www.jobkorea.co.kr/Login/Login_Tot.asp?returnUrl=secret" } })));
    await expect(client.request(detail, "detail", JobKoreaRequestBudget.forManualDetailCollection(1))).rejects.toMatchObject({
      code: "JOBKOREA_LOGIN_REDIRECT", url: "https://www.jobkorea.co.kr/Login/Login_Tot.asp",
      context: { requestedUrl: detail, finalUrl: "https://www.jobkorea.co.kr/Login/Login_Tot.asp", httpStatus: 302,
        redirectCount: 1, redirectClassification: "login_redirect",
        redirectChain: [{ status: 302, host: "www.jobkorea.co.kr", path: "/Login/Login_Tot.asp" }] },
    });
  });
  it("동일 posting ID의 desktop/mobile canonical redirect만 따른다", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => String(input).includes("www.jobkorea")
      ? new Response(null, { status: 302, headers: { location: "https://m.jobkorea.co.kr/Recruit/GI_Read/50000001?tracking=removed" } })
      : htmlResponse("<!doctype html><script type='application/ld+json'>{\"@type\":\"JobPosting\"}</script>"));
    const result = await new JobKoreaHttpClient(fetchMock).request("https://www.jobkorea.co.kr/Recruit/GI_Read/50000001", "detail", JobKoreaRequestBudget.forManualDetailCollection(1));
    expect(result).toMatchObject({ finalUrl: "https://m.jobkorea.co.kr/Recruit/GI_Read/50000001", status: 200,
      redirectCount: 1, redirectClassification: "mobile_desktop_canonical_redirect" });
    expect(result.redirectChain).toEqual([{ status: 302, host: "m.jobkorea.co.kr", path: "/Recruit/GI_Read/50000001" }]);
  });
  it("detail redirect가 posting ID를 바꾸면 거부한다", async () => {
    const client = new JobKoreaHttpClient(vi.fn(async () => new Response(null, { status: 302,
      headers: { location: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000002" } })));
    await expect(client.request("https://www.jobkorea.co.kr/Recruit/GI_Read/50000001", "detail", JobKoreaRequestBudget.forManualDetailCollection(1)))
      .rejects.toMatchObject({ code: "JOBKOREA_DETAIL_ID_MISMATCH" });
  });
  it("hard request budget은 다섯 번째 콘텐츠 HTTP 요청을 거부한다", () => {
    const budget = new JobKoreaRequestBudget();
    for (let index = 0; index < 4; index += 1) budget.consumeHttp("detail");
    expect(() => budget.consumeHttp("detail")).toThrowError(expect.objectContaining({ code: "JOBKOREA_REQUEST_BUDGET_EXCEEDED" }));
  });
  it("max-details 1은 목록 1회와 상세 1회만 허용한다", () => {
    const budget = new JobKoreaRequestBudget(1);
    budget.consumeHttp("listing");
    budget.consumeHttp("detail");
    expect(() => budget.consumeHttp("detail")).toThrowError(expect.objectContaining({ code: "JOBKOREA_REQUEST_BUDGET_EXCEEDED" }));
  });
  it("환경 변수로 timeout·응답 크기 hard cap을 높일 수 없다", () => {
    expect(getJobKoreaHttpClientConfig({ JOBKOREA_TRANSPORT_TIMEOUT_MS: "999999", JOBKOREA_TRANSPORT_MAX_RESPONSE_BYTES: "999999999" } as unknown as NodeJS.ProcessEnv))
      .toEqual({ timeoutMs: 15_000, maxResponseBytes: 2 * 1024 * 1024 });
  });
  it("manual collection은 각 detail의 bounded redirect hop을 별도 HTTP 요청으로 허용한다", () => {
    const budget = JobKoreaRequestBudget.forManualDetailCollection(5);
    expect(budget.contentRequestLimit).toBe(20);
    for (let index = 0; index < 5; index += 1) budget.startPage("detail");
    expect(() => budget.startPage("detail")).toThrowError(expect.objectContaining({ code: "JOBKOREA_REQUEST_BUDGET_EXCEEDED" }));
    for (let index = 0; index < 20; index += 1) budget.consumeHttp("detail");
    expect(() => budget.consumeHttp("detail")).toThrowError(expect.objectContaining({ code: "JOBKOREA_REQUEST_BUDGET_EXCEEDED" }));
  });
});
