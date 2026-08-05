import type { ParseDiagnostic } from "../../../domain/source-contract";
import { normalizeJobKoreaUrl, sourcePostingIdFromUrl } from "./jobkorea-url-policy";
import type { JobKoreaListingCandidate, JobKoreaListingPageResult, JobKoreaRenderedPageSnapshot, JobKoreaSearchPageClassification } from "./jobkorea-search-types";

const blockedClassifications = new Set<JobKoreaSearchPageClassification>(["login_redirect", "verification_page", "captcha_page", "access_denied"]);
const diagnostic = (code: string, message: string, severity: ParseDiagnostic["severity"] = "warning"): ParseDiagnostic => ({ severity, code, field: null, message });

export function classifyJobKoreaRenderedPage(snapshot: JobKoreaRenderedPageSnapshot): JobKoreaSearchPageClassification {
  const url = new URL(snapshot.finalUrl);
  const text = `${snapshot.title} ${snapshot.bodyText}`.replace(/\s+/g, " ").toLowerCase();
  if (url.pathname === "/") return "root_redirect";
  if (/\/(?:login|member\/login)/i.test(url.pathname) || /로그인이\s*필요|회원\s*로그인/.test(text)) return "login_redirect";
  if (/captcha|자동입력\s*방지|로봇이\s*아닙니다/.test(text)) return "captcha_page";
  if (/본인\s*확인|보안\s*확인|verification/.test(text)) return "verification_page";
  if (/접근이\s*차단|access\s*denied|비정상적인\s*접근|권한이\s*없습니다/.test(text)) return "access_denied";
  const hasOrdinaryEvidence = snapshot.anchors.some(({ ordinaryContainer, promotedEvidence, recommendationEvidence }) => ordinaryContainer && !promotedEvidence && !recommendationEvidence);
  if (hasOrdinaryEvidence) return "valid_search_results";
  if (snapshot.sourceReportsNoResults) return "valid_empty_results";
  if (snapshot.anchors.length) return "malformed_results";
  return "unexpected_page";
}

export function buildJobKoreaListingPageResult(snapshot: JobKoreaRenderedPageSnapshot, pageNumber: number, globalSeen = new Set<string>()): JobKoreaListingPageResult {
  const classification = classifyJobKoreaRenderedPage(snapshot);
  const diagnostics: ParseDiagnostic[] = [];
  const candidates: JobKoreaListingCandidate[] = [];
  const withinPage = new Set<string>();
  let extractedCount = 0;
  let ordinaryPostingCount = 0;
  let promotedPostingCount = 0;
  let rejectedCandidateCount = 0;
  let duplicateWithinPageCount = 0;
  let uniqueNewCount = 0;

  if (classification === "valid_search_results") {
    for (const anchor of snapshot.anchors) {
      if (!/\/Recruit\/GI_Read\//i.test(anchor.href)) continue;
      extractedCount += 1;
      if (anchor.promotedEvidence) { promotedPostingCount += 1; continue; }
      if (anchor.recommendationEvidence || !anchor.ordinaryContainer) { rejectedCandidateCount += 1; continue; }
      ordinaryPostingCount += 1;
      try {
        const sourceUrl = normalizeJobKoreaUrl(new URL(anchor.href, snapshot.finalUrl).toString(), "detail");
        const sourcePostingId = sourcePostingIdFromUrl(sourceUrl);
        if (!sourcePostingId || (anchor.dataGno && anchor.dataGno !== sourcePostingId)) {
          rejectedCandidateCount += 1;
          diagnostics.push(diagnostic("JOBKOREA_LISTING_ID_MISMATCH", "행 ID와 상세 URL ID가 일치하지 않습니다."));
          continue;
        }
        if (withinPage.has(sourceUrl)) { duplicateWithinPageCount += 1; continue; }
        withinPage.add(sourceUrl);
        if (!globalSeen.has(sourceUrl)) { globalSeen.add(sourceUrl); uniqueNewCount += 1; }
        candidates.push({ sourcePostingId, sourceUrl, title: anchor.title.trim() || `잡코리아 공고 ${sourcePostingId}`,
          companyName: anchor.companyName.trim() || "상세 페이지 확인 전", pageNumber, listingPosition: candidates.length + 1, promoted: false });
      } catch {
        rejectedCandidateCount += 1;
        diagnostics.push(diagnostic("JOBKOREA_DETAIL_URL_REJECTED", "유효하지 않은 상세 후보 URL을 제외했습니다."));
      }
    }
    if (!candidates.length) diagnostics.push(diagnostic("JOBKOREA_ORDINARY_RESULTS_MALFORMED", "일반 공고 컨테이너에서 유효한 상세 후보를 만들지 못했습니다.", "error"));
  } else {
    const code = `JOBKOREA_PAGE_${classification.toUpperCase()}`;
    diagnostics.push(diagnostic(code, `잡코리아 검색 페이지 분류: ${classification}`, blockedClassifications.has(classification) ? "error" : "warning"));
  }
  const parserFailure = classification === "malformed_results" || classification === "unexpected_page" || (classification === "valid_search_results" && candidates.length === 0);
  return {
    pageNumber, classification, extractedCount, ordinaryPostingCount, promotedPostingCount, rejectedCandidateCount,
    duplicateWithinPageCount, uniqueNewCount, sourceReportsNoResults: snapshot.sourceReportsNoResults,
    validEmptyPage: classification === "valid_empty_results", blocked: blockedClassifications.has(classification), parserFailure,
    diagnostics, candidates,
  };
}
