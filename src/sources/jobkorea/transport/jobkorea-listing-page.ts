import type { ParseDiagnostic } from "../../../domain/source-contract";
import { normalizeJobKoreaUrl, sourcePostingIdFromUrl } from "./jobkorea-url-policy";
import type { JobKoreaListingCandidate, JobKoreaListingPageResult, JobKoreaPageSnapshot, JobKoreaSearchPageClassification } from "./jobkorea-search-types";

const blockedClassifications = new Set<JobKoreaSearchPageClassification>(["login_redirect", "verification_page", "captcha_page", "access_denied"]);
const unmeasuredClassifications = new Set<JobKoreaSearchPageClassification>(["login_redirect", "verification_page", "captcha_page", "access_denied"]);
const diagnostic = (code: string, message: string, severity: ParseDiagnostic["severity"] = "warning"): ParseDiagnostic => ({ severity, code, field: null, message });

export function classifyJobKoreaRenderedPage(snapshot: JobKoreaPageSnapshot): JobKoreaSearchPageClassification {
  let pathname: string;
  try { pathname = new URL(snapshot.finalUrl).pathname; } catch { return "unexpected_page"; }
  if (/\/(?:login|member\/login)/i.test(pathname) || (snapshot.evidence.loginMarkerCount ?? 0) > 0) return "login_redirect";
  if ((snapshot.evidence.captchaMarkerCount ?? 0) > 0) return "captcha_page";
  if ((snapshot.evidence.verificationMarkerCount ?? 0) > 0) return "verification_page";
  if ((snapshot.evidence.accessDeniedMarkerCount ?? 0) > 0) return "access_denied";
  if (pathname === "/") return "root_redirect";
  if (!snapshot.extractionCompleted || snapshot.diagnostics.some(({ code }) => code === "JOBKOREA_SNAPSHOT_EVALUATION_FAILED")) return "malformed_results";
  if (snapshot.ordinaryCandidates.length > 0 && (snapshot.evidence.ordinaryDetailLinkCount ?? 0) > 0) return "valid_search_results";
  if ((snapshot.evidence.noResultMarkerCount ?? 0) > 0) return "valid_empty_results";
  if ((snapshot.evidence.ordinaryContainerCount ?? 0) > 0 || (snapshot.evidence.allNumericDetailLinkCount ?? 0) > 0
    || snapshot.promotedCandidates.length > 0 || snapshot.rejectedCandidates.length > 0) return "malformed_results";
  return "unexpected_page";
}

export function buildJobKoreaListingPageResult(snapshot: JobKoreaPageSnapshot, pageNumber: number, globalSeen = new Set<string>()): JobKoreaListingPageResult {
  const classificationStartedAt = performance.now();
  const classification = classifyJobKoreaRenderedPage(snapshot);
  const classificationDurationMs = Math.max(0, performance.now() - classificationStartedAt);
  const diagnostics: ParseDiagnostic[] = snapshot.diagnostics.map(({ code, message }) => diagnostic(code, message,
    code === "JOBKOREA_SNAPSHOT_EVALUATION_FAILED" ? "error" : "warning"));
  const candidates: JobKoreaListingCandidate[] = [];
  const withinPage = new Set<string>();
  const countsMeasured = snapshot.extractionCompleted && !unmeasuredClassifications.has(classification);
  let duplicateWithinPageCount: number | null = countsMeasured ? 0 : null;
  let uniqueNewCount: number | null = countsMeasured ? 0 : null;

  if (classification === "valid_search_results") {
    for (const candidate of snapshot.ordinaryCandidates) {
      try {
        const sourceUrl = normalizeJobKoreaUrl(candidate.href, "detail");
        const sourcePostingId = sourcePostingIdFromUrl(sourceUrl);
        if (!sourcePostingId || candidate.postingId !== sourcePostingId || (candidate.rowId && candidate.rowId !== sourcePostingId)) {
          diagnostics.push(diagnostic("JOBKOREA_LISTING_ID_MISMATCH", "행 ID와 상세 URL ID가 일치하지 않습니다."));
          continue;
        }
        if (withinPage.has(sourceUrl)) { duplicateWithinPageCount = (duplicateWithinPageCount ?? 0) + 1; continue; }
        withinPage.add(sourceUrl);
        if (!globalSeen.has(sourceUrl)) { globalSeen.add(sourceUrl); uniqueNewCount = (uniqueNewCount ?? 0) + 1; }
        candidates.push({ sourcePostingId, sourceUrl, title: candidate.title.trim() || `잡코리아 공고 ${sourcePostingId}`,
          companyName: candidate.companyName.trim() || "상세 페이지 확인 전", pageNumber,
          listingPosition: candidate.position, promoted: false });
      } catch {
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
    pageNumber, snapshotSchemaVersion: snapshot.schemaVersion, serializedSnapshotBytes: snapshot.serializedSnapshotBytes,
    finalUrl: snapshot.finalUrl, pageTitle: snapshot.pageTitle, documentReadyState: snapshot.documentReadyState,
    readinessReason: snapshot.readiness?.reason ?? null,
    readinessNumericDetailLinkCount: snapshot.readiness?.numericDetailLinkCount ?? null,
    readinessOrdinaryContainerCount: snapshot.readiness?.ordinaryContainerCount ?? null,
    domChangedAfterReadiness: snapshot.domChangedAfterReadiness, classificationDurationMs,
    extractionDurationMs: snapshot.extractionDurationMs, classification,
    extractedCount: countsMeasured ? snapshot.evidence.allNumericDetailLinkCount : null,
    ordinaryPostingCount: countsMeasured ? snapshot.evidence.ordinaryDetailLinkCount : null,
    promotedPostingCount: countsMeasured ? snapshot.evidence.promotedDetailLinkCount : null,
    rejectedCandidateCount: countsMeasured ? snapshot.evidence.rejectedDetailLinkCount : null,
    duplicateWithinPageCount, uniqueNewCount,
    sourceReportsNoResults: countsMeasured ? (snapshot.evidence.noResultMarkerCount ?? 0) > 0 : null,
    validEmptyPage: classification === "valid_empty_results", blocked: blockedClassifications.has(classification), parserFailure,
    evidence: countsMeasured ? snapshot.evidence : null,
    rejectionReasonCounts: countsMeasured ? snapshot.rejectionReasonCounts : null,
    promotionSignalCounts: countsMeasured ? snapshot.promotionSignalCounts : null,
    diagnosticSamples: countsMeasured ? snapshot.diagnosticSamples : null,
    containerSignatures: countsMeasured ? snapshot.containerSignatures : null,
    containerSignaturesTruncated: countsMeasured ? snapshot.containerSignaturesTruncated : null,
    shadowStructure: countsMeasured ? snapshot.shadowStructure : null,
    diagnostics, candidates,
  };
}
