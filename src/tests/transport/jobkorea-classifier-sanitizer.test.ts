import { describe, expect, it } from "vitest";
import { classifyJobKoreaResponse } from "../../sources/jobkorea/transport/jobkorea-response-classifier";
import { sanitizeJobKoreaDetail, sanitizeJobKoreaListing } from "../../sources/jobkorea/transport/jobkorea-sanitizer";
import { detailHtml, listingHtml, syntheticEmail, syntheticPhone } from "./jobkorea-test-responses";

const response = (body: string, finalUrl = "https://www.jobkorea.co.kr/Search/", status = 200, contentType = "text/html") => ({ finalUrl, status, contentType, body, redirectCount: 0 });

describe("잡코리아 response classifier", () => {
  it("유효 listing·detail·마감 detail을 구분한다", () => {
    expect(classifyJobKoreaResponse(response(listingHtml()), "listing")).toBe("valid_listing");
    expect(classifyJobKoreaResponse(response(detailHtml("1"), "https://www.jobkorea.co.kr/Recruit/GI_Read/1"), "detail")).toBe("valid_detail");
    expect(classifyJobKoreaResponse(response(`${detailHtml("1")}<p>마감되었습니다</p>`, "https://www.jobkorea.co.kr/Recruit/GI_Read/1"), "detail")).toBe("closed_detail");
  });
  it.each([
    ["JOBKOREA_NOT_FOUND", response("not found", "https://www.jobkorea.co.kr/Search/", 404)],
    ["JOBKOREA_ROOT_REDIRECT", response(listingHtml(), "https://www.jobkorea.co.kr/")],
    ["JOBKOREA_LOGIN_REDIRECT", response("<!doctype html><a href='/login'>로그인이 필요합니다</a>")],
    ["JOBKOREA_VERIFICATION_PAGE", response("<!doctype html><p>CAPTCHA 자동입력 방지</p>")],
    ["JOBKOREA_ACCESS_BLOCKED", response("<!doctype html><p>Access Denied</p>")],
    ["JOBKOREA_UNEXPECTED_CONTENT_TYPE", response(listingHtml(), "https://www.jobkorea.co.kr/Search/", 200, "application/json")],
  ])("%s를 진단한다", (code, input) => expect(() => classifyJobKoreaResponse(input, "listing")).toThrowError(expect.objectContaining({ code })));
});

describe("잡코리아 in-memory sanitizer", () => {
  it("목록 상세 후보만 축약하고 tracking query를 제거한다", () => {
    const result = sanitizeJobKoreaListing(`${listingHtml(["1"])}<a href='https://evil.test/Recruit/GI_Read/2'>악성</a>`, "https://www.jobkorea.co.kr/Search/", "2026-08-05T00:00:00Z");
    expect(result.observed).toBe(2);
    expect(result.fixture.items?.[0]?.sourceUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/1");
    expect(result.rejected[0]?.code).toBe("JOBKOREA_HOST_REJECTED");
  });
  it("JSON-LD 핵심은 유지하고 설명·전화·이메일·contact field를 제외한다", () => {
    const fixture = sanitizeJobKoreaDetail(detailHtml("1"), "https://www.jobkorea.co.kr/Recruit/GI_Read/1", "2026-08-05T00:00:00Z", false);
    const serialized = JSON.stringify(fixture);
    expect(serialized).toContain('"@type":"JobPosting"');
    expect(serialized).toContain("월급 280만원");
    expect(serialized).not.toContain(syntheticPhone);
    expect(serialized).not.toContain(syntheticEmail);
    expect(serialized).not.toMatch(/description|contactPoint|담당자 가상담당/);
  });
  it("JobPosting이 없으면 sanitizer 단계에서 ingestion을 차단한다", () => {
    expect(() => sanitizeJobKoreaDetail("<!doctype html><p>일반 오류</p>", "https://www.jobkorea.co.kr/Recruit/GI_Read/1", "2026-08-05T00:00:00Z", false)).toThrowError(expect.objectContaining({ code: "JOBKOREA_DETAIL_PARSER_FAILURE" }));
  });
});
