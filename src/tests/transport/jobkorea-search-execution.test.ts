import { describe, expect, it, vi } from "vitest";
import { JobKoreaDirectSearchClient } from "../../sources/jobkorea/transport/jobkorea-direct-search";
import { createJobKoreaSearchExecution } from "../../sources/jobkorea/transport/jobkorea-search-execution";
import type { JobKoreaDirectContractObservation, JobKoreaSearchExecution, JobKoreaSearchOptions } from "../../sources/jobkorea/transport/jobkorea-search-types";

const options = (transport: "auto" | "playwright" | "direct"): JobKoreaSearchOptions => ({ searchUrl: "https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1",
  pages: 1, maxDetails: 0, transport, confirm: true, dryRun: true });
const directObservation: JobKoreaDirectContractObservation = { endpoint: "https://www.jobkorea.co.kr/Recruit/Home/_GI_List/", method: "POST",
  body: { page: "1", order: "20", pagesize: "40", tabindex: "0", "condition[local]": "" }, contentType: "application/x-www-form-urlencoded",
  ordinaryResultSelector: "tr.devloopArea[data-gno]", hasCookieHeader: false, hasAuthorizationHeader: false, hasTokenField: false };

function fakeBrowser(available: boolean): JobKoreaSearchExecution {
  return { transportUsed: "playwright", pages: [], consoleErrors: [], searchNavigationCount: 1, detailNavigationCount: 0, directRequestCount: 0,
    directVerification: available ? { classification: "available", observation: directObservation,
      diagnostic: { severity: "info", code: "AVAILABLE", field: null, message: "available" } }
      : { classification: "direct_endpoint_unavailable", observation: null,
        diagnostic: { severity: "warning", code: "UNAVAILABLE", field: null, message: "unavailable" } },
    close: vi.fn(async () => undefined), fetchDetail: vi.fn(async () => { throw new Error("not used"); }) };
}

describe("잡코리아 search transport selection", () => {
  it.each(["auto", "playwright"] as const)("%s는 검증 사실을 숨겨 전환하지 않고 Playwright를 사용한다", async (transport) => {
    const result = await createJobKoreaSearchExecution(options(transport), { createPlaywright: async () => fakeBrowser(true) });
    expect(result.transportUsed).toBe("playwright");
    expect(result.directRequestCount).toBe(0);
  });
  it("direct는 현재 계약이 미관찰이면 요청하지 않는다", async () => {
    const direct = new JobKoreaDirectSearchClient(vi.fn());
    const result = await createJobKoreaSearchExecution(options("direct"), { createPlaywright: async () => fakeBrowser(false), directClient: direct });
    expect(result.transportUsed).toBe("direct");
    expect(result.directRequestCount).toBe(0);
    expect(result.pages[0]?.classification).toBe("direct_endpoint_unavailable");
  });
  it("direct는 익명 계약 확인 후 정확히 한 번만 호출한다", async () => {
    const html = '<tr class="devloopArea" data-gno="11"><td><a href="/Recruit/GI_Read/11">공고 11</a></td></tr>';
    const fetchMock = vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await createJobKoreaSearchExecution(options("direct"), { createPlaywright: async () => fakeBrowser(true), directClient: new JobKoreaDirectSearchClient(fetchMock) });
    expect(result).toMatchObject({ transportUsed: "direct", directRequestCount: 1 });
    expect(result.pages[0]?.candidates[0]?.sourcePostingId).toBe("11");
  });
});
