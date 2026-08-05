import { describe, expect, it, vi } from "vitest";
import { getJobKoreaHttpClientConfig, JobKoreaHttpClient } from "../../sources/jobkorea/transport/jobkorea-http-client";
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
  it("쿠키·인증·referrer 없이 고정 User-Agent를 보낸다", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => htmlResponse("<!doctype html><a href='/Recruit/GI_Read/1'>x</a>"));
    await new JobKoreaHttpClient(fetchMock).request(listing, "listing", new JobKoreaRequestBudget());
    const init = fetchMock.mock.calls[0]?.[1];
    if (!init) throw new Error("request init missing");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({ "user-agent": "NearbyJobsMap/0.1 one-shot local research prototype" });
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|authorization|referer/i);
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
});
