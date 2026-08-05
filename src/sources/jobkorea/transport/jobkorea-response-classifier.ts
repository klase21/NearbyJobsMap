import { JobKoreaTransportError } from "./jobkorea-error";
import type { JobKoreaHttpResponse } from "./types";

export type JobKoreaResponseClassification = "valid_listing" | "valid_detail" | "closed_detail";

export function classifyJobKoreaResponse(response: JobKoreaHttpResponse, expected: "listing" | "detail"): JobKoreaResponseClassification {
  if (new URL(response.finalUrl).pathname === "/") throw new JobKoreaTransportError("JOBKOREA_ROOT_REDIRECT", "루트 페이지로 이동한 응답은 공고로 처리하지 않습니다.", response.finalUrl);
  if (response.status === 404) throw new JobKoreaTransportError("JOBKOREA_NOT_FOUND", "공개 페이지를 찾을 수 없습니다.", response.finalUrl);
  if (response.status < 200 || response.status >= 300) throw new JobKoreaTransportError("JOBKOREA_HTTP_STATUS_ERROR", `HTTP ${response.status} 응답을 받았습니다.`, response.finalUrl);
  if (!/^text\/html\b/i.test(response.contentType)) throw new JobKoreaTransportError("JOBKOREA_UNEXPECTED_CONTENT_TYPE", "HTML 응답이 아닙니다.", response.finalUrl);
  const compact = response.body.replace(/\s+/g, " ").toLowerCase();
  if (!compact.trim()) throw new JobKoreaTransportError("JOBKOREA_EMPTY_RESPONSE", "응답 본문이 비어 있습니다.", response.finalUrl);
  if (/captcha|자동입력\s*방지|로봇이\s*아닙니다/.test(compact)) throw new JobKoreaTransportError("JOBKOREA_VERIFICATION_PAGE", "CAPTCHA 또는 자동입력 방지 페이지가 감지됐습니다.", response.finalUrl);
  if (/접근이\s*차단|access\s*denied|권한이\s*없습니다|비정상적인\s*접근/.test(compact)) throw new JobKoreaTransportError("JOBKOREA_ACCESS_BLOCKED", "접근 차단 페이지가 감지됐습니다.", response.finalUrl);
  if (/본인\s*확인|보안\s*확인|verification/.test(compact)) throw new JobKoreaTransportError("JOBKOREA_VERIFICATION_PAGE", "확인 절차 페이지가 감지됐습니다.", response.finalUrl);
  if (/로그인/.test(compact) && /(?:\/login|member\/login|로그인이\s*필요)/.test(compact)) throw new JobKoreaTransportError("JOBKOREA_LOGIN_REDIRECT", "로그인 페이지가 감지됐습니다.", response.finalUrl);
  if (!/(?:<!doctype\s+html|<html|<script|<a\s)/i.test(response.body)) throw new JobKoreaTransportError("JOBKOREA_MALFORMED_HTML", "예상 가능한 HTML 구조가 없습니다.", response.finalUrl);
  if (expected === "listing") {
    if (!/\/Recruit\/GI_Read\/\d+/i.test(response.body)) throw new JobKoreaTransportError("JOBKOREA_ZERO_LISTING_CANDIDATES", "목록에서 공개 상세 후보를 찾지 못했습니다.", response.finalUrl);
    return "valid_listing";
  }
  if (!/"@type"\s*:\s*"JobPosting"/i.test(response.body) && !/마감되었습니다|채용이\s*마감/.test(response.body)) {
    throw new JobKoreaTransportError("JOBKOREA_DETAIL_PAGE_INVALID", "JobPosting 구조나 명시적 마감 정보를 찾지 못했습니다.", response.finalUrl);
  }
  return /마감되었습니다|채용이\s*마감/.test(response.body) ? "closed_detail" : "valid_detail";
}
