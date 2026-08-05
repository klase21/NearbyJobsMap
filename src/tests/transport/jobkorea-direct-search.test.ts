import { describe, expect, it, vi } from "vitest";
import { classifyDirectContractResponse, JobKoreaDirectSearchClient } from "../../sources/jobkorea/transport/jobkorea-direct-search";
import { verifyDirectObservation } from "../../sources/jobkorea/transport/jobkorea-playwright-search";
import type { JobKoreaDirectContractObservation } from "../../sources/jobkorea/transport/jobkorea-search-types";

const endpoint = "https://www.jobkorea.co.kr/Recruit/Home/_GI_List/";
const observation = (overrides: Partial<JobKoreaDirectContractObservation> = {}): JobKoreaDirectContractObservation => ({
  endpoint, method: "POST", body: { page: "1", "condition[local]": "", order: "20", pagesize: "40", tabindex: "0" },
  contentType: "application/x-www-form-urlencoded", ordinaryResultSelector: "tr.devloopArea[data-gno]",
  hasCookieHeader: false, hasAuthorizationHeader: false, hasTokenField: false, ...overrides,
});
const rows = `<table><tr class="devloopArea" data-gno="11"><td><a href="/Recruit/GI_Read/11?logpath=x">일반 11</a></td></tr>
  <tr class="devloopArea" data-gno="12"><td>AD <a href="/Recruit/GI_Read/12">광고 12</a></td></tr></table>`;

describe("잡코리아 observed _GI_List contract", () => {
  it("익명 POST form 계약만 available로 분류한다", () => expect(verifyDirectObservation(observation()).classification).toBe("available"));
  it.each([
    observation({ hasCookieHeader: true }), observation({ hasAuthorizationHeader: true }), observation({ hasTokenField: true }),
  ])("session·token 의존 관찰을 거부한다", (input) => expect(verifyDirectObservation(input).classification).toBe("direct_endpoint_session_required"));
  it("ordinary row와 promoted row를 분리한다", () => {
    const result = classifyDirectContractResponse({ status: 200, contentType: "text/html", body: rows, finalUrl: endpoint });
    expect(result).toMatchObject({ classification: "valid_search_results", ordinaryPostingCount: 1, promotedPostingCount: 1 });
    expect(result.candidates.map(({ sourcePostingId }) => sourcePostingId)).toEqual(["11"]);
  });
  it("명시적 empty 응답만 valid empty로 분류한다", () => expect(classifyDirectContractResponse({ status: 200, contentType: "text/html", body: "<p>검색 결과가 없습니다</p>", finalUrl: endpoint }).validEmptyPage).toBe(true));
  it.each([
    [401, "text/html", "로그인이 필요합니다", "direct_endpoint_session_required"],
    [200, "application/json", "{}", "direct_endpoint_unavailable"],
    [500, "text/html", "error", "direct_endpoint_unavailable"],
    [200, "text/html", "<p>예상하지 않은 응답</p>", "direct_endpoint_unavailable"],
  ])("잘못된 direct 응답을 %s로 일반 공고 처리하지 않는다", (status, contentType, body, classification) => {
    expect(classifyDirectContractResponse({ status: status as number, contentType: contentType as string, body: body as string, finalUrl: endpoint }).classification).toBe(classification);
  });
  it("쿠키·인증 없이 한 번만 POST한다", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(rows, { status: 200, headers: { "content-type": "text/html" } }));
    const client = new JobKoreaDirectSearchClient(fetchMock);
    await client.request(observation());
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization|token/i);
    await expect(client.request(observation())).rejects.toMatchObject({ code: "JOBKOREA_DIRECT_REQUEST_BUDGET_EXCEEDED" });
  });
});
