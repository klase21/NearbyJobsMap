import type { Page } from "playwright";
import type { JobKoreaPageSnapshot, JobKoreaSnapshotDiagnostic } from "./jobkorea-search-types";

export const JOBKOREA_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const JOBKOREA_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT = 200;

const EVIDENCE_KEYS = [
  "ordinaryContainerCount", "ordinaryDetailLinkCount", "allNumericDetailLinkCount",
  "promotedContainerCount", "promotedDetailLinkCount", "rejectedDetailLinkCount", "noResultMarkerCount",
  "loginMarkerCount", "captchaMarkerCount", "verificationMarkerCount", "accessDeniedMarkerCount",
] as const;

export class JobKoreaSnapshotError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JobKoreaSnapshotError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonSafe(value: unknown, seen = new Set<object>(), path = "snapshot"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE", `${path}에 유한하지 않은 숫자가 있습니다.`);
    return;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE", `${path}에 JSON 비지원 값이 있습니다.`);
  }
  if (typeof value !== "object") throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE", `${path} 값이 JSON-safe하지 않습니다.`);
  if (seen.has(value)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED", `${path}에 순환 참조가 있습니다.`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => assertJsonSafe(item, seen, `${path}[${index}]`));
  else {
    if (!isPlainRecord(value)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE", `${path}에 plain object가 아닌 값이 있습니다.`);
    for (const [key, item] of Object.entries(value)) assertJsonSafe(item, seen, `${path}.${key}`);
  }
  seen.delete(value);
}

function stringField(record: Record<string, unknown>, key: string, maximum: number): string {
  const value = record[key];
  if (typeof value !== "string" || value.length > maximum) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", `${key} 문자열이 유효하지 않습니다.`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string, maximum: number): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", `${key} 값이 문자열 또는 null이 아닙니다.`);
  return value;
}

function diagnosticArray(value: unknown): JobKoreaSnapshotDiagnostic[] {
  if (!Array.isArray(value) || value.length > 50) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "snapshot diagnostics가 유효하지 않습니다.");
  return value.map((item) => {
    if (!isPlainRecord(item)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "snapshot diagnostic이 plain object가 아닙니다.");
    return { code: stringField(item, "code", 100), message: stringField(item, "message", 500) };
  });
}

export function validateJobKoreaPageSnapshot(value: unknown): JobKoreaPageSnapshot {
  if (!isPlainRecord(value) || value.schemaVersion !== JOBKOREA_SNAPSHOT_SCHEMA_VERSION) {
    throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_RESULT_MALFORMED", "snapshot schemaVersion 또는 최상위 구조가 유효하지 않습니다.");
  }
  const extractionCompleted = value.extractionCompleted;
  if (typeof extractionCompleted !== "boolean") throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "extractionCompleted가 boolean이 아닙니다.");
  const evidenceRecord = value.evidence;
  if (!isPlainRecord(evidenceRecord)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "snapshot evidence가 plain object가 아닙니다.");
  const evidence = Object.fromEntries(EVIDENCE_KEYS.map((key) => {
    const count = evidenceRecord[key];
    if (count !== null && (!Number.isInteger(count) || (count as number) < 0)) {
      throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", `${key}가 nonnegative integer 또는 null이 아닙니다.`);
    }
    return [key, count as number | null];
  })) as JobKoreaPageSnapshot["evidence"];

  const ordinary = value.ordinaryCandidates;
  const promoted = value.promotedCandidates;
  const rejected = value.rejectedCandidates;
  if (!Array.isArray(ordinary) || !Array.isArray(promoted) || !Array.isArray(rejected)
    || ordinary.length > JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT || promoted.length > JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT || rejected.length > JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT) {
    throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "snapshot candidate 배열이 유효하지 않습니다.");
  }
  const ordinaryCandidates = ordinary.map((item) => {
    if (!isPlainRecord(item)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "ordinary candidate가 plain object가 아닙니다.");
    const postingId = stringField(item, "postingId", 30);
    if (!/^\d+$/.test(postingId)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "ordinary postingId가 숫자 문자열이 아닙니다.");
    if (!Number.isInteger(item.position) || (item.position as number) < 1) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "ordinary position이 유효하지 않습니다.");
    return { postingId, href: stringField(item, "href", 2_048), title: stringField(item, "title", 300),
      companyName: stringField(item, "companyName", 200), position: item.position as number,
      rowId: nullableString(item, "rowId", 30), sourceSelector: stringField(item, "sourceSelector", 100) };
  });
  const promotedCandidates = promoted.map((item) => {
    if (!isPlainRecord(item)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "promoted candidate가 plain object가 아닙니다.");
    const postingId = nullableString(item, "postingId", 30);
    if (postingId !== null && !/^\d+$/.test(postingId)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "promoted postingId가 유효하지 않습니다.");
    return { postingId, href: nullableString(item, "href", 2_048), reason: stringField(item, "reason", 100) };
  });
  const rejectedCandidates = rejected.map((item) => {
    if (!isPlainRecord(item)) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "rejected candidate가 plain object가 아닙니다.");
    return { href: nullableString(item, "href", 2_048), reason: stringField(item, "reason", 100) };
  });
  if (!extractionCompleted && (EVIDENCE_KEYS.some((key) => evidence[key] !== null)
    || ordinaryCandidates.length || promotedCandidates.length || rejectedCandidates.length)) {
    throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_VALIDATION_FAILED", "미완료 snapshot에 측정된 candidate 값이 있습니다.");
  }
  return {
    schemaVersion: JOBKOREA_SNAPSHOT_SCHEMA_VERSION,
    finalUrl: stringField(value, "finalUrl", 2_048), pageTitle: stringField(value, "pageTitle", 500),
    readyState: stringField(value, "readyState", 30), extractionCompleted, evidence,
    ordinaryCandidates, promotedCandidates, rejectedCandidates, diagnostics: diagnosticArray(value.diagnostics),
  };
}

export function validateAndRoundTripJobKoreaSnapshot(value: unknown, maximumBytes = JOBKOREA_SNAPSHOT_MAX_BYTES): JobKoreaPageSnapshot {
  assertJsonSafe(value);
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch (error) { throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED", "snapshot JSON 직렬화에 실패했습니다.", { cause: error }); }
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_TOO_LARGE", `snapshot이 ${maximumBytes} byte 제한을 초과했습니다.`);
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch (error) { throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED", "snapshot JSON round-trip에 실패했습니다.", { cause: error }); }
  return validateJobKoreaPageSnapshot(parsed);
}

// This source is deliberately a literal. Passing a TypeScript function to page.evaluate
// lets tsx/esbuild inject helpers (for example __name) that do not exist in the page realm.
export const JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE = String.raw`(() => {
      const schemaVersion = 1;
      const candidateLimit = 200;
      const compact = (input, maximum) => String(input ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
      const nullable = (input, maximum) => input === null ? null : compact(input, maximum);
      const emptyEvidence = () => ({ ordinaryContainerCount: null, ordinaryDetailLinkCount: null, allNumericDetailLinkCount: null,
        promotedContainerCount: null, promotedDetailLinkCount: null, rejectedDetailLinkCount: null, noResultMarkerCount: null, loginMarkerCount: null,
        captchaMarkerCount: null, verificationMarkerCount: null, accessDeniedMarkerCount: null });
      try {
        const bodyText = compact(document.body?.innerText, 200_000);
        const ordinarySelectors = "tr.devloopArea[data-gno], .list-default, .recruit-info, .recruit-list, .search-list, .list-post, [class*='recruit-list'], [class*='search-list']";
        const excludedSelectors = "header, footer, aside, nav, [class*='recommend'], [class*='attention'], [class*='recent']";
        const detailNodes = Array.from(document.querySelectorAll('a[href*="/Recruit/GI_Read"]'));
        const ordinaryCandidates = [];
        const promotedCandidates = [];
        const rejectedCandidates = [];
        const diagnostics = [];
        let allNumericDetailLinkCount = 0;
        let ordinaryDetailLinkCount = 0;
        let promotedDetailLinkCount = 0;
        let rejectedDetailLinkCount = 0;
        let nonHtmlAnchorSeen = false;
        for (const node of detailNodes) {
          const rawHref = node instanceof Element ? node.getAttribute("href") : null;
          if (!(node instanceof HTMLAnchorElement)) {
            nonHtmlAnchorSeen = true;
            rejectedDetailLinkCount += 1;
            if (rejectedCandidates.length < candidateLimit) rejectedCandidates.push({ href: nullable(rawHref, 2_048), reason: "non_html_anchor" });
            continue;
          }
          const href = compact(node.href, 2_048);
          const idMatch = /\/Recruit\/GI_Read\/(\d+)(?:[/?#]|$)/i.exec(href);
          const postingId = idMatch?.[1] ?? null;
          if (postingId) allNumericDetailLinkCount += 1;
          const row = node.closest("tr.devloopArea[data-gno]");
          const container = row ?? node.closest("li, article, [data-gno], .item, .post, .list-item") ?? node.parentElement;
          const ordinaryRoot = node.closest(ordinarySelectors);
          const excludedRoot = node.closest(excludedSelectors);
          const containerText = compact(container?.textContent, 1_000);
          const recommendation = Boolean(excludedRoot) || /지금\s*주목할\s*만한\s*공고|추천\s*공고|최근\s*본\s*공고/.test(containerText);
          const promoted = /(?:^|\s)AD(?:\s|$)|스폰서|sponsored/i.test(containerText)
            || Boolean(container?.querySelector("[class*='ad'], [class*='sponsor']"));
          const ordinary = Boolean(row || (ordinaryRoot && !excludedRoot));
          if (recommendation) {
            rejectedDetailLinkCount += 1;
            if (rejectedCandidates.length < candidateLimit) rejectedCandidates.push({ href, reason: "recommendation_region" });
            continue;
          }
          if (promoted) {
            promotedDetailLinkCount += 1;
            if (promotedCandidates.length < candidateLimit) promotedCandidates.push({ postingId, href, reason: "promoted_or_ad" });
            continue;
          }
          if (!ordinary) {
            rejectedDetailLinkCount += 1;
            if (rejectedCandidates.length < candidateLimit) rejectedCandidates.push({ href, reason: "outside_ordinary_results" });
            continue;
          }
          if (!postingId) {
            rejectedDetailLinkCount += 1;
            if (rejectedCandidates.length < candidateLimit) rejectedCandidates.push({ href, reason: "malformed_posting_id" });
            continue;
          }
          ordinaryDetailLinkCount += 1;
          if (ordinaryCandidates.length < candidateLimit) {
            const company = container?.querySelector(".name, .company, [class*='company'], [class*='corp']");
            ordinaryCandidates.push({ postingId, href, title: compact(node.textContent, 300), companyName: compact(company?.textContent, 200),
              position: ordinaryCandidates.length + 1, rowId: nullable(row?.getAttribute("data-gno") ?? null, 30),
              sourceSelector: row ? "tr.devloopArea[data-gno]" : "ordinary_result_container" });
          }
        }
        if (nonHtmlAnchorSeen) diagnostics.push({ code: "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE", message: "HTMLAnchorElement가 아닌 detail-link 모양 요소를 제외했습니다." });
        return { schemaVersion, finalUrl: String(location.href), pageTitle: compact(document.title, 500), readyState: String(document.readyState),
          extractionCompleted: true, evidence: {
            ordinaryContainerCount: document.querySelectorAll(ordinarySelectors).length, ordinaryDetailLinkCount, allNumericDetailLinkCount,
            promotedContainerCount: document.querySelectorAll("[class*='ad'], [class*='sponsor']").length, promotedDetailLinkCount,
            rejectedDetailLinkCount,
            noResultMarkerCount: /검색\s*결과가\s*없|채용정보가\s*없|조건에\s*맞는\s*공고가\s*없/.test(bodyText) ? 1 : 0,
            loginMarkerCount: /로그인이\s*필요|회원\s*로그인/.test(bodyText) ? 1 : 0,
            captchaMarkerCount: /captcha|자동입력\s*방지|로봇이\s*아닙니다/i.test(bodyText) ? 1 : 0,
            verificationMarkerCount: /본인\s*확인|보안\s*확인|verification/i.test(bodyText) ? 1 : 0,
            accessDeniedMarkerCount: /접근이\s*차단|access\s*denied|비정상적인\s*접근|권한이\s*없습니다/i.test(bodyText) ? 1 : 0,
          }, ordinaryCandidates, promotedCandidates, rejectedCandidates, diagnostics };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { schemaVersion, finalUrl: String(location.href), pageTitle: String(document.title ?? "").slice(0, 500),
          readyState: String(document.readyState), extractionCompleted: false, evidence: emptyEvidence(), ordinaryCandidates: [],
          promotedCandidates: [], rejectedCandidates: [], diagnostics: [{ code: "JOBKOREA_SNAPSHOT_EVALUATION_FAILED",
            message: compact(message, 500) || "page context snapshot extraction failed" }] };
      }
    })()`;

export async function captureJobKoreaPageSnapshot(page: Page): Promise<JobKoreaPageSnapshot> {
  let raw: unknown;
  try {
    raw = await page.evaluate(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE);
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Playwright page.evaluate 실패").split(/\r?\n/, 1)[0]!.slice(0, 500);
    const code = /Execution context was destroyed|Target page, context or browser has been closed/i.test(message)
      ? "JOBKOREA_SNAPSHOT_EXECUTION_CONTEXT_DESTROYED"
      : /\b__name is not defined\b/.test(message)
        ? "JOBKOREA_SNAPSHOT_TRANSFORM_HELPER_MISSING"
        : "JOBKOREA_SNAPSHOT_EVALUATION_FAILED";
    throw new JobKoreaSnapshotError(code, message, { cause: error });
  }
  return validateAndRoundTripJobKoreaSnapshot(raw);
}
