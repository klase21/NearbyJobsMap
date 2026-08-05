import type { ParseDiagnostic } from "../../../domain/source-contract";
import { JobKoreaTransportError } from "./jobkorea-error";
import { buildJobKoreaListingPageResult, classifyJobKoreaRenderedPage } from "./jobkorea-listing-page";
import { validateAndRoundTripJobKoreaSnapshot } from "./jobkorea-page-snapshot";
import { failedSearchPageResult } from "./jobkorea-playwright-search";
import { JOBKOREA_HARD_MAX_RESPONSE_BYTES, JOBKOREA_HARD_TIMEOUT_MS, JOBKOREA_USER_AGENT } from "./jobkorea-http-client";
import type { JobKoreaDirectContractObservation, JobKoreaListingPageResult, JobKoreaPageSnapshot } from "./jobkorea-search-types";

export type JobKoreaDirectFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const diagnostic = (code: string, message: string, severity: ParseDiagnostic["severity"] = "warning"): ParseDiagnostic => ({ severity, code, field: null, message });

async function readBoundedResponse(response: Response): Promise<string> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > JOBKOREA_HARD_MAX_RESPONSE_BYTES) throw new JobKoreaTransportError("JOBKOREA_RESPONSE_TOO_LARGE", "_GI_List 응답 크기가 허용 한도를 초과했습니다.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > JOBKOREA_HARD_MAX_RESPONSE_BYTES) { await reader.cancel(); throw new JobKoreaTransportError("JOBKOREA_RESPONSE_TOO_LARGE", "_GI_List 응답 크기가 허용 한도를 초과했습니다."); }
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally { reader.releaseLock(); }
}

function stripTags(value: string): string { return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }

export function directHtmlSnapshot(html: string, finalUrl: string): JobKoreaPageSnapshot {
  const ordinaryCandidates: JobKoreaPageSnapshot["ordinaryCandidates"] = [];
  const promotedCandidates: JobKoreaPageSnapshot["promotedCandidates"] = [];
  const rowPattern = /<tr\b([^>]*\bclass\s*=\s*["'][^"']*\bdevloopArea\b[^"']*["'][^>]*)>([\s\S]*?)<\/tr>/gi;
  for (const row of html.matchAll(rowPattern)) {
    const attributes = row[1] ?? "";
    const content = row[2] ?? "";
    const dataGno = attributes.match(/\bdata-gno\s*=\s*["'](\d+)["']/i)?.[1] ?? null;
    const link = content.match(/<a\b[^>]*href\s*=\s*["']([^"']*\/Recruit\/GI_Read\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const containerText = stripTags(content);
    const href = new URL(link[1]!, finalUrl).toString();
    const postingId = href.match(/\/Recruit\/GI_Read\/(\d+)/i)?.[1] ?? null;
    const promoted = /(?:^|\s)AD(?:\s|$)|스폰서|sponsored/i.test(containerText);
    if (promoted) promotedCandidates.push({ postingId, href, reason: "INSIDE_PROMOTED_REGION" });
    else if (postingId) ordinaryCandidates.push({ postingId, href, title: stripTags(link[2]!), companyName: "상세 페이지 확인 전",
      position: ordinaryCandidates.length + 1, rowId: dataGno, sourceSelector: "tr.devloopArea[data-gno]" });
  }
  const bodyText = stripTags(html);
  const noResult = /검색\s*결과가\s*없|채용정보가\s*없|조건에\s*맞는\s*공고가\s*없/.test(bodyText);
  return validateAndRoundTripJobKoreaSnapshot({ schemaVersion: 2, serializedSnapshotBytes: 0, finalUrl,
    pageTitle: "JobKorea _GI_List", documentReadyState: "complete", extractionCompleted: true,
    extractionDurationMs: 0, readiness: null, domChangedAfterReadiness: null,
    evidence: { ordinaryContainerCount: ordinaryCandidates.length, ordinaryRowCount: ordinaryCandidates.length,
      resultRootCount: ordinaryCandidates.length ? 1 : 0, knownTableResultCount: ordinaryCandidates.length ? 1 : 0,
      knownListResultCount: 0, knownCardResultCount: 0, numericLinksInsideKnownTableResults: ordinaryCandidates.length,
      numericLinksInsideKnownListResults: 0, numericLinksInsideKnownCardResults: 0, ordinaryDetailLinkCount: ordinaryCandidates.length,
      allNumericDetailLinkCount: ordinaryCandidates.length + promotedCandidates.length,
      promotedContainerCount: promotedCandidates.length, recommendationContainerCount: 0, recentViewContainerCount: 0,
      promotedDetailLinkCount: promotedCandidates.length, rejectedDetailLinkCount: 0,
      numericLinksInsideKnownResultRoots: ordinaryCandidates.length + promotedCandidates.length,
      numericLinksOutsideKnownResultRoots: 0, noResultMarkerCount: noResult ? 1 : 0,
      loginMarkerCount: 0, captchaMarkerCount: 0, verificationMarkerCount: 0, accessDeniedMarkerCount: 0 },
    rejectionReasonCounts: {}, ordinaryCandidates, promotedCandidates: promotedCandidates.slice(0, 10), rejectedCandidates: [],
    diagnosticSamples: { ordinary: [], promoted: [], rejected: [], ordinaryTruncated: false,
      promotedTruncated: promotedCandidates.length > 10, rejectedTruncated: false },
    containerSignatures: [], containerSignaturesTruncated: false, diagnostics: [] });
}

export function classifyDirectContractResponse(input: { status: number; contentType: string; body: string; finalUrl: string }, pageNumber = 1): JobKoreaListingPageResult {
  if (input.status === 401 || input.status === 403 || /로그인|세션|token|csrf/i.test(input.body)) {
    return { ...failedSearchPageResult(pageNumber, "direct_endpoint_session_required", "JOBKOREA_DIRECT_ENDPOINT_SESSION_REQUIRED"),
      finalUrl: input.finalUrl, parserFailure: false,
      diagnostics: [diagnostic("JOBKOREA_DIRECT_ENDPOINT_SESSION_REQUIRED", "_GI_List 응답이 session 또는 token 의존성을 나타냈습니다.", "error")] };
  }
  if (input.status < 200 || input.status >= 300 || !/^text\/html\b/i.test(input.contentType)) {
    return { ...failedSearchPageResult(pageNumber, "direct_endpoint_unavailable", "JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE"),
      finalUrl: input.finalUrl, parserFailure: false,
      diagnostics: [diagnostic("JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", "_GI_List 익명 HTML 응답 계약을 확인하지 못했습니다.")] };
  }
  const snapshot = directHtmlSnapshot(input.body, input.finalUrl);
  const classification = classifyJobKoreaRenderedPage(snapshot);
  if (classification !== "valid_search_results" && classification !== "valid_empty_results") {
    return { ...buildJobKoreaListingPageResult(snapshot, pageNumber), classification: "direct_endpoint_unavailable",
      extractedCount: snapshot.evidence.allNumericDetailLinkCount, ordinaryPostingCount: 0, promotedPostingCount: snapshot.evidence.promotedDetailLinkCount,
      rejectedCandidateCount: snapshot.evidence.rejectedDetailLinkCount, duplicateWithinPageCount: 0, uniqueNewCount: 0, sourceReportsNoResults: (snapshot.evidence.noResultMarkerCount ?? 0) > 0,
      validEmptyPage: false, blocked: false, parserFailure: false,
      diagnostics: [diagnostic("JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", "_GI_List ordinary row 계약을 확인하지 못했습니다.")], candidates: [] };
  }
  return buildJobKoreaListingPageResult(snapshot, pageNumber);
}

export class JobKoreaDirectSearchClient {
  requestCount = 0;
  constructor(private readonly fetchImplementation: JobKoreaDirectFetch = fetch) {}

  async request(observation: JobKoreaDirectContractObservation): Promise<JobKoreaListingPageResult> {
    if (this.requestCount >= 1) throw new JobKoreaTransportError("JOBKOREA_DIRECT_REQUEST_BUDGET_EXCEEDED", "_GI_List 검증 요청은 최대 1회입니다.");
    this.requestCount += 1;
    const body = new URLSearchParams(observation.body);
    body.set("page", "1");
    const pageSize = Number(body.get("pagesize"));
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 40) throw new JobKoreaTransportError("JOBKOREA_DIRECT_CONTRACT_INVALID", "관찰된 pagesize가 안전 범위를 벗어났습니다.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JOBKOREA_HARD_TIMEOUT_MS);
    try {
      const response = await this.fetchImplementation(observation.endpoint, { method: "POST", redirect: "manual", signal: controller.signal,
        headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "user-agent": JOBKOREA_USER_AGENT }, body });
      if (response.status >= 300 && response.status < 400) throw new JobKoreaTransportError("JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", "_GI_List redirect를 익명 계약으로 사용하지 않습니다.", observation.endpoint);
      const responseBody = await readBoundedResponse(response);
      return classifyDirectContractResponse({ status: response.status, contentType: response.headers.get("content-type") ?? "",
        body: responseBody, finalUrl: observation.endpoint });
    } catch (error) {
      if (error instanceof JobKoreaTransportError) throw error;
      if (controller.signal.aborted) throw new JobKoreaTransportError("JOBKOREA_TRANSPORT_TIMEOUT", "_GI_List 요청 시간이 초과됐습니다.", observation.endpoint, { cause: error });
      throw new JobKoreaTransportError("JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", "_GI_List 익명 요청에 실패했습니다.", observation.endpoint, { cause: error });
    } finally { clearTimeout(timer); }
  }
}
