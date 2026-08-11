import { createHash } from "node:crypto";
import type { ParseDiagnostic } from "../../../domain/source-contract";
import { classifyPostingDateEvidenceAt, createSourcePostingDateEvidence, resolvePostingDateAtCutoff } from "../../../services/collection-date";
import { JOBKOREA_HARD_MAX_RESPONSE_BYTES, JOBKOREA_HARD_TIMEOUT_MS, JOBKOREA_USER_AGENT } from "../transport/jobkorea-http-client";
import type {
  JobKoreaCollectionCandidate,
  JobKoreaFailedResourceSummary,
  JobKoreaListingCardFields,
  JobKoreaListingPageResult,
  JobKoreaSearchExecution,
  JobKoreaSearchOptions,
} from "../transport/jobkorea-search-types";

export const JOBKOREA_TODAY_ENDPOINT = "https://www.jobkorea.co.kr/Recruit/Home/_GI_List/";
export const JOBKOREA_TODAY_PAGE_SIZE = 50;
export const JOBKOREA_TODAY_SORT_CODE = 2;
export const JOBKOREA_TODAY_HARD_MAX_PAGES = 100;
export const JOBKOREA_BACKFILL_HARD_MAX_PAGES = 500;

export type JobKoreaTodayStopReason = "older_page" | "explicit_empty" | "zero_valid_rows" | "repeated_page" | "hard_limit" | "transport_failure";
export type JobKoreaTodayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface HtmlElement { inner: string; outer: string }
interface ParsedTodayPage { result: JobKoreaListingPageResult; fingerprint: string; rowCount: number }

const emptyResources = (): JobKoreaFailedResourceSummary => ({
  totalCount: 0, typeCounts: {}, samples: [], samplesTruncated: false, preventedReadinessOrExtraction: null,
});
const diagnostic = (code: string, message: string, severity: ParseDiagnostic["severity"] = "warning"): ParseDiagnostic => ({ severity, code, field: null, message });

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function text(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/gu, " ").trim();
}

function attribute(openingTag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = openingTag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]!) : null;
}

function hasClasses(openingTag: string, required: readonly string[]): boolean {
  const classes = new Set((attribute(openingTag, "class") ?? "").split(/\s+/u).filter(Boolean));
  return required.every((name) => classes.has(name));
}

function balancedElementAt(source: string, start: number, tag: string): HtmlElement | null {
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = start;
  let depth = 0;
  let openingEnd = -1;
  for (let match = token.exec(source); match; match = token.exec(source)) {
    if (match.index === start && !match[0].startsWith("</")) openingEnd = token.lastIndex;
    if (match[0].startsWith("</")) depth -= 1; else depth += 1;
    if (openingEnd >= 0 && depth === 0) return { inner: source.slice(openingEnd, match.index), outer: source.slice(start, token.lastIndex) };
    if (depth < 0) return null;
  }
  return null;
}

function firstElementByClasses(source: string, tag: string, required: readonly string[]): HtmlElement | null {
  const opening = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  for (let match = opening.exec(source); match; match = opening.exec(source)) {
    if (!hasClasses(match[0], required)) continue;
    return balancedElementAt(source, match.index, tag);
  }
  return null;
}

function allElementsByClasses(source: string, tag: string, required: readonly string[]): HtmlElement[] {
  const output: HtmlElement[] = [];
  const opening = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  for (let match = opening.exec(source); match; match = opening.exec(source)) {
    if (!hasClasses(match[0], required)) continue;
    const element = balancedElementAt(source, match.index, tag);
    if (element) output.push(element);
  }
  return output;
}

function anchors(source: string): Array<{ href: string; label: string }> {
  return [...source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: attribute(match[1] ?? "", "href") ?? "", label: text(match[2] ?? ""),
  }));
}

function normalizeRegistration(value: string): string | null {
  const normalized = text(value).replace(/(\d)\s+(분|시간|일)/gu, "$1$2").replace(/(분|시간|일)\s+전/gu, "$1 전").trim();
  return normalized ? normalized.slice(0, 50) : null;
}

export interface JobKoreaListingMetadataCells {
  experience: string | null;
  education: string | null;
  location: string | null;
  employment: string | null;
  salary: string | null;
  positionGrade: string | null;
  salaryCandidateRejected: boolean;
  cells: string[];
}

export function isJobKoreaListingSalaryDisplay(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (!normalized) return false;
  if (/(?:시급|일급|주급|월급|연봉|급여|회사\s*내규|내규에\s*따름|협의|면접\s*후\s*결정)/u.test(normalized)) return true;
  return /\d[\d,.]*(?:\s*(?:~|～|-|–)\s*\d[\d,.]*)?\s*(?:억|만원|원)(?:\s*(?:이상|이하))?(?:\s*\((?:월|연)\))?/u.test(normalized);
}

export function extractJobKoreaListingMetadataCells(row: string): JobKoreaListingMetadataCells {
  const titleCell = firstElementByClasses(row, "td", ["tplTit"]);
  const metadata = firstElementByClasses(titleCell?.inner ?? "", "p", ["etc"]);
  const cells = metadata ? allElementsByClasses(metadata.inner, "span", ["cell"]).map((cell) => text(cell.inner)) : [];
  const at = (index: number): string | null => cells[index]?.trim() || null;
  const salaryCandidate = at(4);
  return {
    experience: at(0), education: at(1), location: at(2), employment: at(3),
    salary: isJobKoreaListingSalaryDisplay(salaryCandidate) ? salaryCandidate : null,
    positionGrade: at(5), salaryCandidateRejected: Boolean(salaryCandidate) && !isJobKoreaListingSalaryDisplay(salaryCandidate),
    cells,
  };
}

function metadataFields(row: string): JobKoreaListingCardFields {
  const metadata = extractJobKoreaListingMetadataCells(row);
  const regionText = metadata.location && /(?:서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충[북남]|전[북남]|경[북남]|제주)/u.test(metadata.location) ? metadata.location : null;
  const employmentTypes = metadata.employment && /(?:정규직|계약직|인턴|아르바이트|파견직|위촉직|프리랜서)/u.test(metadata.employment) ? [metadata.employment] : [];
  const experienceRequirement = metadata.experience && /(?:신입|경력)/u.test(metadata.experience) ? metadata.experience : null;
  const educationRequirement = metadata.education && /(?:학력|고졸|초대졸|대졸|석사|박사)/u.test(metadata.education) ? metadata.education : null;
  const odd = firstElementByClasses(row, "td", ["odd"]);
  const registration = normalizeRegistration(firstElementByClasses(odd?.inner ?? "", "span", ["time", "dotum"])?.inner ?? "");
  const deadline = text(firstElementByClasses(odd?.inner ?? "", "span", ["date", "dotum"])?.inner ?? "") || null;
  return { title: null, companyName: null, regionText, salaryText: metadata.salary, employmentTypes,
    experienceRequirement, educationRequirement, postedAt: registration,
    postingDateEvidence: createSourcePostingDateEvidence(registration, "listing_registered"), deadlineText: deadline,
    positionGrade: metadata.positionGrade, salaryCandidateRejected: metadata.salaryCandidateRejected };
}

function failedPage(pageNumber: number, code: string, message: string): JobKoreaListingPageResult {
  return { pageNumber, observedAt: null, snapshotSchemaVersion: null, serializedSnapshotBytes: null, finalUrl: JOBKOREA_TODAY_ENDPOINT,
    pageTitle: "JobKorea _GI_List", documentReadyState: "complete", readinessReason: "unknown", readinessNumericDetailLinkCount: null,
    readinessOrdinaryContainerCount: null, domChangedAfterReadiness: null, classificationDurationMs: null, extractionDurationMs: null,
    classification: "direct_endpoint_unavailable", extractedCount: null, ordinaryPostingCount: null, promotedPostingCount: null,
    rejectedCandidateCount: null, duplicateWithinPageCount: null, uniqueNewCount: null, sourceReportsNoResults: null,
    validEmptyPage: false, blocked: false, parserFailure: true, evidence: null, rejectionReasonCounts: null,
    promotionSignalCounts: null, diagnosticSamples: null, containerSignatures: null, containerSignaturesTruncated: null,
    shadowStructure: null, collectionCandidates: null, diagnostics: [diagnostic(code, message, "error")], candidates: [] };
}

export function parseJobKoreaHttpTodayPage(html: string, pageNumber: number, observedAt: string, globalSeen = new Set<string>()): ParsedTodayPage {
  const root = allElementsByClasses(html, "div", ["tplJobListWrap"]).find((item) => text(item.inner).includes("전체 채용정보 목록")) ?? null;
  if (!root) return { result: failedPage(pageNumber, "JOBKOREA_TODAY_RESULT_ROOT_MISSING", "The bounded _GI_List result root was not found."), fingerprint: "", rowCount: 0 };
  const candidates: JobKoreaCollectionCandidate[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  const withinPage = new Set<string>();
  let duplicates = 0;
  let rejected = 0;
  const rows = [...root.inner.matchAll(/<tr\b([^>]*\bclass\s*=\s*["'][^"']*\bdevloopArea\b[^"']*["'][^>]*)>([\s\S]*?)<\/tr>/gi)];
  for (const [index, row] of rows.entries()) {
    const opening = row[1] ?? "";
    const body = row[2] ?? "";
    const postingId = attribute(opening, "data-gno");
    const titleCell = firstElementByClasses(body, "td", ["tplTit"]);
    const companyCell = firstElementByClasses(body, "td", ["tplCo"]);
    const titleStrong = firstElementByClasses(titleCell?.inner ?? "", "strong", []);
    const titleLink = anchors(titleStrong?.inner ?? "").find(({ href }) => /\/Recruit\/GI_Read\/\d+/i.test(href));
    const hrefId = titleLink?.href.match(/\/Recruit\/GI_Read\/(\d+)/i)?.[1] ?? null;
    const company = anchors(companyCell?.inner ?? "").find(({ label }) => Boolean(label))?.label ?? null;
    const title = titleLink?.label ?? null;
    if (!postingId || !/^\d+$/u.test(postingId) || postingId !== hrefId || !title || !company) {
      rejected += 1;
      diagnostics.push(diagnostic("JOBKOREA_TODAY_ROW_REJECTED", "A bounded listing row failed identity, title, or company validation."));
      continue;
    }
    if (withinPage.has(postingId)) { duplicates += 1; continue; }
    withinPage.add(postingId);
    const fields = metadataFields(body);
    fields.title = title;
    fields.companyName = company;
    const canonicalUrl = `https://www.jobkorea.co.kr/Recruit/GI_Read/${postingId}`;
    candidates.push({ postingId, canonicalUrl, firstSourcePosition: index + 1, observedLinkCount: 1,
      listingClassification: "verified_ordinary", listingFields: fields });
  }
  let uniqueNew = 0;
  for (const candidate of candidates) if (!globalSeen.has(candidate.postingId)) { globalSeen.add(candidate.postingId); uniqueNew += 1; }
  const explicitEmpty = rows.length === 0 && /(?:검색\s*결과가\s*없|등록된\s*채용정보가\s*없|채용정보가\s*없)/u.test(text(root.inner));
  const classification = candidates.length ? "valid_search_results" : explicitEmpty ? "valid_empty_results" : "malformed_results";
  const fingerprint = createHash("sha256").update(candidates.map((candidate) => `${candidate.postingId}:${candidate.listingFields?.postingDateEvidence?.raw ?? ""}`).join("|")).digest("hex");
  const result: JobKoreaListingPageResult = { pageNumber, observedAt, snapshotSchemaVersion: null, serializedSnapshotBytes: null,
    finalUrl: JOBKOREA_TODAY_ENDPOINT, pageTitle: "JobKorea _GI_List", documentReadyState: "complete", readinessReason: candidates.length ? "numeric_detail_link" : explicitEmpty ? "no_result" : "unknown",
    readinessNumericDetailLinkCount: candidates.length, readinessOrdinaryContainerCount: rows.length, domChangedAfterReadiness: false,
    classificationDurationMs: null, extractionDurationMs: null, classification, extractedCount: candidates.length + rejected,
    ordinaryPostingCount: candidates.length, promotedPostingCount: 0, rejectedCandidateCount: rejected,
    duplicateWithinPageCount: duplicates, uniqueNewCount: uniqueNew, sourceReportsNoResults: explicitEmpty, validEmptyPage: explicitEmpty,
    blocked: false, parserFailure: classification === "malformed_results", evidence: null, rejectionReasonCounts: null,
    promotionSignalCounts: null, diagnosticSamples: null, containerSignatures: null, containerSignaturesTruncated: null,
    shadowStructure: null, collectionCandidates: candidates, diagnostics,
    candidates: candidates.map((candidate) => ({ sourcePostingId: candidate.postingId, sourceUrl: candidate.canonicalUrl,
      title: candidate.listingFields!.title!, companyName: candidate.listingFields!.companyName!, pageNumber,
      listingPosition: candidate.firstSourcePosition, promoted: false })) };
  return { result, fingerprint, rowCount: rows.length };
}

export function buildJobKoreaTodayForm(pageNumber: number): URLSearchParams {
  return new URLSearchParams({ "isDefault": "true", "condition[local]": "I000,B000", "condition[menucode]": "",
    page: String(pageNumber), direct: "0", order: String(JOBKOREA_TODAY_SORT_CODE), pagesize: String(JOBKOREA_TODAY_PAGE_SIZE),
    tabindex: "0", onePick: "0", confirm: "0", profile: "0" });
}

async function readBounded(response: Response): Promise<string> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > JOBKOREA_HARD_MAX_RESPONSE_BYTES) throw new Error("JOBKOREA_TODAY_RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > JOBKOREA_HARD_MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("JOBKOREA_TODAY_RESPONSE_TOO_LARGE"); }
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally { reader.releaseLock(); }
}

export interface JobKoreaHttpTodayDependencies { fetchImplementation?: JobKoreaTodayFetch; now?: () => Date }

export async function createJobKoreaHttpTodayExecution(options: JobKoreaSearchOptions, dependencies: JobKoreaHttpTodayDependencies = {}): Promise<JobKoreaSearchExecution> {
  if (!options.localTodayMode || (!options.collectionDate && !options.backfillCutoffDate)) throw new Error("JobKorea HTTP listing execution requires a fixed date scope.");
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const pages: JobKoreaListingPageResult[] = [];
  const seen = new Set<string>();
  const fingerprints = new Set<string>();
  const requested = options.pageNumbers ?? Array.from({ length: options.pages }, (_, index) => index + 1);
  let stopReason: JobKoreaTodayStopReason = "hard_limit";
  let completedByExhaustion = false;
  const maximumPages = options.backfillCutoffDate ? JOBKOREA_BACKFILL_HARD_MAX_PAGES : JOBKOREA_TODAY_HARD_MAX_PAGES;
  for (const pageNumber of requested.slice(0, maximumPages)) {
    if (options.signal?.aborted) { stopReason = "transport_failure"; break; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JOBKOREA_HARD_TIMEOUT_MS);
    try {
      const response = await fetchImplementation(JOBKOREA_TODAY_ENDPOINT, { method: "POST", redirect: "manual", signal: controller.signal,
        headers: { accept: "text/html, */*; q=0.01", "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          origin: "https://www.jobkorea.co.kr", referer: "https://www.jobkorea.co.kr/recruit/joblist?menucode=local&localorder=1",
          "x-requested-with": "XMLHttpRequest", "user-agent": JOBKOREA_USER_AGENT }, body: buildJobKoreaTodayForm(pageNumber) });
      const observedAt = now().toISOString();
      if (response.status < 200 || response.status >= 300 || !/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) {
        pages.push(failedPage(pageNumber, "JOBKOREA_TODAY_HTTP_FAILED", `The _GI_List response was rejected with status ${response.status}.`));
        stopReason = "transport_failure";
        break;
      }
      const parsed = parseJobKoreaHttpTodayPage(await readBounded(response), pageNumber, observedAt, seen);
      pages.push(parsed.result);
      options.onPage?.(parsed.result);
      if (parsed.result.validEmptyPage) { stopReason = "explicit_empty"; completedByExhaustion = true; break; }
      if (!parsed.result.collectionCandidates?.length) { stopReason = "zero_valid_rows"; break; }
      if (fingerprints.has(parsed.fingerprint)) { stopReason = "repeated_page"; completedByExhaustion = true; break; }
      fingerprints.add(parsed.fingerprint);
      const statuses = parsed.result.collectionCandidates.map((candidate) => options.backfillCutoffDate
        ? resolvePostingDateAtCutoff(candidate.listingFields?.postingDateEvidence?.raw, observedAt, options.backfillCutoffDate!)
        : classifyPostingDateEvidenceAt(candidate.listingFields?.postingDateEvidence?.raw, observedAt, options.collectionDate!.resolvedDate));
      const exhausted = options.backfillCutoffDate
        ? statuses.every((status) => "onOrAfterCutoff" in status && status.onOrAfterCutoff === false)
        : statuses.every(({ status }) => status === "older");
      if ((parsed.result.rejectedCandidateCount ?? 0) === 0 && statuses.length > 0 && exhausted) {
        stopReason = "older_page"; completedByExhaustion = true; break;
      }
      if (pages.length === requested.length) { stopReason = "hard_limit"; completedByExhaustion = true; }
    } catch (error) {
      pages.push(failedPage(pageNumber, controller.signal.aborted ? "JOBKOREA_TODAY_TIMEOUT" : "JOBKOREA_TODAY_TRANSPORT_FAILED",
        error instanceof Error ? error.message.slice(0, 200) : "The _GI_List request failed."));
      stopReason = "transport_failure";
      break;
    } finally { clearTimeout(timer); }
  }
  return { transportUsed: "http_post_listing", pages, consoleErrors: [], failedResources: emptyResources(),
    directVerification: { classification: "available", observation: null,
      diagnostic: diagnostic("JOBKOREA_TODAY_HTTP_CONTRACT", "The verified public _GI_List POST contract was used.") },
    lifecycleDiagnostics: [], searchNavigationCount: 0, detailNavigationCount: 0, directRequestCount: pages.length,
    completedByExhaustion, stopReason,
    async close() {}, async fetchDetail() { throw new Error("JobKorea HTTP TODAY collection never requests detail pages."); } };
}
