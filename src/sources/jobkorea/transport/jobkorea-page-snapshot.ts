import type { Page } from "playwright";
import type {
  JobKoreaCandidateDiagnosticSample, JobKoreaContainerSignatureSummary, JobKoreaDocumentReadyState,
  JobKoreaElementSignature, JobKoreaPageSnapshot, JobKoreaReadinessEvidence, JobKoreaRejectionReason,
  JobKoreaSnapshotDiagnostic, JobKoreaSnapshotExcludedCandidate,
} from "./jobkorea-search-types";

export const JOBKOREA_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const JOBKOREA_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT = 200;
export const JOBKOREA_ORDINARY_SAMPLE_LIMIT = 10;
export const JOBKOREA_PROMOTED_SAMPLE_LIMIT = 10;
export const JOBKOREA_REJECTED_SAMPLE_LIMIT = 20;
export const JOBKOREA_CONTAINER_SIGNATURE_LIMIT = 20;
export const JOBKOREA_ANCESTOR_DEPTH_LIMIT = 8;

export const JOBKOREA_REJECTION_REASONS = [
  "NO_ORDINARY_ANCESTOR", "INSIDE_RECOMMENDATION_REGION", "INSIDE_RECENT_VIEW_REGION",
  "INSIDE_UNRELATED_WIDGET", "INVALID_POSTING_ID", "INVALID_DETAIL_PATH", "DISALLOWED_HOST",
  "TRACKING_REDIRECT", "OUTSIDE_RESULT_ROOT", "ANCESTOR_SIGNATURE_UNRECOGNIZED",
  "DETACHED_DURING_EXTRACTION", "SVG_ANCHOR_UNSUPPORTED", "UNKNOWN_REJECTION",
] as const satisfies readonly JobKoreaRejectionReason[];

const REJECTION_REASON_SET = new Set<string>(JOBKOREA_REJECTION_REASONS);
const PROMOTION_SIGNAL_SET = new Set(["exact_class_token", "data_attribute", "semantic_label"]);
const READY_STATES = new Set(["loading", "interactive", "complete", "unknown"]);
const READINESS_REASONS = new Set(["numeric_detail_link", "ordinary_container", "no_result", "login", "captcha", "verification", "access_denied", "unknown"]);
const EVIDENCE_KEYS = [
  "ordinaryContainerCount", "ordinaryRowCount", "resultRootCount", "knownTableResultCount",
  "knownListResultCount", "knownCardResultCount", "numericLinksInsideKnownTableResults",
  "numericLinksInsideKnownListResults", "numericLinksInsideKnownCardResults", "ordinaryDetailLinkCount", "allNumericDetailLinkCount",
  "promotedContainerCount", "recommendationContainerCount", "recentViewContainerCount",
  "promotedDetailLinkCount", "rejectedDetailLinkCount", "numericLinksInsideKnownResultRoots",
  "numericLinksOutsideKnownResultRoots", "noResultMarkerCount", "loginMarkerCount", "captchaMarkerCount",
  "verificationMarkerCount", "accessDeniedMarkerCount",
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

function fail(message: string, code = "JOBKOREA_SNAPSHOT_V2_VALIDATION_FAILED"): never {
  throw new JobKoreaSnapshotError(code, message);
}

function assertJsonSafe(value: unknown, seen = new Set<object>(), path = "snapshot"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) fail(`${path}에 유한하지 않은 숫자가 있습니다.`, "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE"); return; }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    fail(`${path}에 JSON 비지원 값이 있습니다.`, "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE");
  }
  if (typeof value !== "object") fail(`${path} 값이 JSON-safe하지 않습니다.`, "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE");
  if (seen.has(value)) fail(`${path}에 순환 참조가 있습니다.`, "JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => assertJsonSafe(item, seen, `${path}[${index}]`));
  else {
    if (!isPlainRecord(value)) fail(`${path}에 plain object가 아닌 값이 있습니다.`, "JOBKOREA_SNAPSHOT_UNSUPPORTED_VALUE");
    for (const [key, item] of Object.entries(value)) assertJsonSafe(item, seen, `${path}.${key}`);
  }
  seen.delete(value);
}

const stringField = (record: Record<string, unknown>, key: string, maximum: number): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length > maximum) fail(`${key} 문자열이 유효하지 않습니다.`);
  return value;
};
const nullableString = (record: Record<string, unknown>, key: string, maximum: number): string | null => {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum) fail(`${key} 값이 문자열 또는 null이 아닙니다.`);
  return value;
};
const countField = (record: Record<string, unknown>, key: string, nullable = false): number | null => {
  const value = record[key];
  if (nullable && value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${key}가 nonnegative integer가 아닙니다.`);
  return value as number;
};

function diagnosticArray(value: unknown): JobKoreaSnapshotDiagnostic[] {
  if (!Array.isArray(value) || value.length > 50) fail("snapshot diagnostics가 유효하지 않습니다.");
  return value.map((item) => {
    if (!isPlainRecord(item)) fail("snapshot diagnostic이 plain object가 아닙니다.");
    return { code: stringField(item, "code", 100), message: stringField(item, "message", 500) };
  });
}

function elementSignature(value: unknown): JobKoreaElementSignature {
  if (!isPlainRecord(value)) fail("element signature가 plain object가 아닙니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  if (!Array.isArray(value.classes) || value.classes.length > 8 || value.classes.some((item) => typeof item !== "string" || item.length > 50)) {
    fail("element signature classes가 유효하지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  }
  if ([...value.classes].sort().join("\0") !== value.classes.join("\0")) fail("element signature classes 순서가 안정적이지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  if (!isPlainRecord(value.dataAttributes) || Object.entries(value.dataAttributes).some(([key, item]) => key.length > 40 || typeof item !== "string" || item.length > 100)) {
    fail("element signature data attributes가 유효하지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  }
  const booleans = ["ariaLabelPresent", "hasKnownOrdinaryMarker", "hasPromotedMarker", "hasRecommendationMarker", "hasRecentViewMarker"] as const;
  if (booleans.some((key) => typeof value[key] !== "boolean")) fail("element signature boolean 값이 유효하지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  const depth = countField(value, "depthFromAnchor")!;
  if (depth > JOBKOREA_ANCESTOR_DEPTH_LIMIT) fail("ancestor depth가 제한을 초과했습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  return {
    tag: stringField(value, "tag", 30), id: nullableString(value, "id", 100), classes: value.classes as string[],
    role: nullableString(value, "role", 50), dataAttributes: value.dataAttributes as Record<string, string>,
    ariaLabelPresent: value.ariaLabelPresent as boolean, depthFromAnchor: depth,
    childElementCount: countField(value, "childElementCount")!, numericDetailLinkCount: countField(value, "numericDetailLinkCount")!,
    hasKnownOrdinaryMarker: value.hasKnownOrdinaryMarker as boolean, hasPromotedMarker: value.hasPromotedMarker as boolean,
    hasRecommendationMarker: value.hasRecommendationMarker as boolean, hasRecentViewMarker: value.hasRecentViewMarker as boolean,
  };
}

function excludedCandidate(value: unknown, promoted: boolean): JobKoreaSnapshotExcludedCandidate {
  if (!isPlainRecord(value)) fail("excluded candidate가 plain object가 아닙니다.");
  const postingId = nullableString(value, "postingId", 30);
  if (postingId !== null && !/^\d+$/.test(postingId)) fail("excluded postingId가 유효하지 않습니다.");
  const reason = stringField(value, "reason", 100);
  if (promoted ? reason !== "INSIDE_PROMOTED_REGION" : !REJECTION_REASON_SET.has(reason)) fail("candidate rejection reason이 유효하지 않습니다.");
  return { postingId, href: nullableString(value, "href", 2_048), reason: reason as JobKoreaSnapshotExcludedCandidate["reason"] };
}

function diagnosticSample(value: unknown): JobKoreaCandidateDiagnosticSample {
  if (!isPlainRecord(value)) fail("candidate diagnostic sample이 plain object가 아닙니다.");
  const postingId = nullableString(value, "postingId", 30);
  if (postingId !== null && !/^\d+$/.test(postingId)) fail("sample postingId가 유효하지 않습니다.");
  const classification = stringField(value, "classification", 20);
  if (!["ordinary", "promoted", "rejected"].includes(classification)) fail("sample classification이 유효하지 않습니다.");
  const primaryReason = nullableString(value, "primaryReason", 100);
  if (primaryReason !== null && primaryReason !== "INSIDE_PROMOTED_REGION" && !REJECTION_REASON_SET.has(primaryReason)) fail("sample primary reason이 유효하지 않습니다.");
  const promotionSignal = nullableString(value, "promotionSignal", 30);
  if (promotionSignal !== null && !PROMOTION_SIGNAL_SET.has(promotionSignal)) fail("sample promotion signal이 유효하지 않습니다.");
  if (!Array.isArray(value.ancestors) || value.ancestors.length > JOBKOREA_ANCESTOR_DEPTH_LIMIT) fail("sample ancestor chain이 유효하지 않습니다.");
  const flags = ["insideKnownResultRoot", "insideKnownOrdinaryRow", "insidePromotedRegion", "insideRecommendationRegion", "insideRecentViewRegion"] as const;
  if (flags.some((key) => typeof value[key] !== "boolean")) fail("sample flag가 유효하지 않습니다.");
  const structureKind = stringField(value, "structureKind", 20);
  if (!["table", "list", "article", "section", "div", "other"].includes(structureKind)) fail("sample structure kind가 유효하지 않습니다.");
  return {
    postingId, href: nullableString(value, "href", 2_048), classification: classification as JobKoreaCandidateDiagnosticSample["classification"],
    primaryReason: primaryReason as JobKoreaCandidateDiagnosticSample["primaryReason"], promotionSignal: promotionSignal as JobKoreaCandidateDiagnosticSample["promotionSignal"], sourcePosition: countField(value, "sourcePosition")!,
    anchor: elementSignature(value.anchor), ancestors: value.ancestors.map(elementSignature),
    insideKnownResultRoot: value.insideKnownResultRoot as boolean, insideKnownOrdinaryRow: value.insideKnownOrdinaryRow as boolean,
    insidePromotedRegion: value.insidePromotedRegion as boolean, insideRecommendationRegion: value.insideRecommendationRegion as boolean,
    insideRecentViewRegion: value.insideRecentViewRegion as boolean, structureKind: structureKind as JobKoreaCandidateDiagnosticSample["structureKind"],
  };
}

function containerSummary(value: unknown): JobKoreaContainerSignatureSummary {
  if (!isPlainRecord(value) || !isPlainRecord(value.candidateClassifications) || !Array.isArray(value.samplePostingIds) || value.samplePostingIds.length > 3) {
    fail("container signature summary가 유효하지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  }
  const counts = value.candidateClassifications;
  const result = { ordinary: countField(counts, "ordinary")!, promoted: countField(counts, "promoted")!, rejected: countField(counts, "rejected")! };
  const count = countField(value, "count")!;
  if (result.ordinary + result.promoted + result.rejected !== count) fail("container classification 합계가 일치하지 않습니다.", "JOBKOREA_CONTAINER_SIGNATURE_INVALID");
  if (value.samplePostingIds.some((id) => typeof id !== "string" || !/^\d+$/.test(id))) fail("container sample ID가 유효하지 않습니다.");
  return { signatureKey: stringField(value, "signatureKey", 500), count, candidateClassifications: result,
    samplePostingIds: value.samplePostingIds as string[], signature: elementSignature(value.signature) };
}

export function validateJobKoreaPageSnapshot(value: unknown): JobKoreaPageSnapshot {
  if (!isPlainRecord(value) || value.schemaVersion !== JOBKOREA_SNAPSHOT_SCHEMA_VERSION) {
    fail("지원하지 않는 snapshot schema version입니다.", "JOBKOREA_SNAPSHOT_SCHEMA_VERSION_UNSUPPORTED");
  }
  const serializedSnapshotBytes = countField(value, "serializedSnapshotBytes")!;
  const actualBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (serializedSnapshotBytes !== actualBytes || actualBytes > JOBKOREA_SNAPSHOT_MAX_BYTES) fail("snapshot serialized byte count가 유효하지 않습니다.");
  if (typeof value.extractionCompleted !== "boolean") fail("extractionCompleted가 boolean이 아닙니다.");
  const readyState = stringField(value, "documentReadyState", 20);
  if (!READY_STATES.has(readyState)) fail("documentReadyState가 유효하지 않습니다.");
  if (value.extractionDurationMs !== null && (typeof value.extractionDurationMs !== "number" || !Number.isFinite(value.extractionDurationMs) || value.extractionDurationMs < 0)) fail("extraction duration이 유효하지 않습니다.");
  if (!isPlainRecord(value.evidence)) fail("snapshot evidence가 plain object가 아닙니다.");
  const evidence = Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, countField(value.evidence as Record<string, unknown>, key, true)])) as JobKoreaPageSnapshot["evidence"];
  let readiness: JobKoreaReadinessEvidence | null = null;
  if (value.readiness !== null) {
    if (!isPlainRecord(value.readiness)) fail("readiness evidence가 유효하지 않습니다.");
    const reason = stringField(value.readiness, "reason", 40);
    if (!READINESS_REASONS.has(reason)) fail("readiness reason이 유효하지 않습니다.");
    readiness = { reason: reason as JobKoreaReadinessEvidence["reason"], numericDetailLinkCount: countField(value.readiness, "numericDetailLinkCount")!,
      ordinaryContainerCount: countField(value.readiness, "ordinaryContainerCount")! };
  }
  if (value.domChangedAfterReadiness !== null && typeof value.domChangedAfterReadiness !== "boolean") fail("domChangedAfterReadiness가 유효하지 않습니다.");
  if (!isPlainRecord(value.rejectionReasonCounts)) fail("rejectionReasonCounts가 plain object가 아닙니다.");
  const rejectionReasonCounts: JobKoreaPageSnapshot["rejectionReasonCounts"] = {};
  for (const key of Object.keys(value.rejectionReasonCounts).sort()) {
    if (!REJECTION_REASON_SET.has(key)) fail("알 수 없는 rejection reason입니다.");
    const count = countField(value.rejectionReasonCounts, key)!;
    if (count > 0) rejectionReasonCounts[key as JobKoreaRejectionReason] = count;
  }
  if (Object.keys(value.rejectionReasonCounts).join("\0") !== Object.keys(value.rejectionReasonCounts).sort().join("\0")) fail("rejection reason keys가 결정적 순서가 아닙니다.");
  const rejectedTotal = Object.values(rejectionReasonCounts).reduce((sum, item) => sum + (item ?? 0), 0);
  if (evidence.rejectedDetailLinkCount !== null && rejectedTotal !== evidence.rejectedDetailLinkCount) fail("rejection reason 합계가 rejected count와 다릅니다.", "JOBKOREA_REJECTION_COUNT_MISMATCH");
  if (!isPlainRecord(value.promotionSignalCounts)) fail("promotionSignalCounts가 plain object가 아닙니다.");
  const promotionSignalCounts: JobKoreaPageSnapshot["promotionSignalCounts"] = {};
  for (const key of Object.keys(value.promotionSignalCounts).sort()) {
    if (!PROMOTION_SIGNAL_SET.has(key)) fail("알 수 없는 promotion signal입니다.");
    const count = countField(value.promotionSignalCounts, key)!;
    if (count > 0) promotionSignalCounts[key as keyof typeof promotionSignalCounts] = count;
  }
  if (Object.keys(value.promotionSignalCounts).join("\0") !== Object.keys(value.promotionSignalCounts).sort().join("\0")) fail("promotion signal keys가 결정적 순서가 아닙니다.");
  const promotedTotal = Object.values(promotionSignalCounts).reduce((sum, item) => sum + (item ?? 0), 0);
  if (evidence.promotedDetailLinkCount !== null && promotedTotal !== evidence.promotedDetailLinkCount) fail("promotion signal 합계가 promoted count와 다릅니다.", "JOBKOREA_PROMOTED_SIGNAL_COUNT_MISMATCH");
  if (!Array.isArray(value.ordinaryCandidates) || value.ordinaryCandidates.length > JOBKOREA_SNAPSHOT_CANDIDATE_LIMIT) fail("ordinary candidate 배열이 유효하지 않습니다.");
  const ordinaryCandidates = value.ordinaryCandidates.map((item) => {
    if (!isPlainRecord(item)) fail("ordinary candidate가 plain object가 아닙니다.");
    const postingId = stringField(item, "postingId", 30);
    if (!/^\d+$/.test(postingId)) fail("ordinary postingId가 유효하지 않습니다.");
    return { postingId, href: stringField(item, "href", 2_048), title: stringField(item, "title", 300), companyName: stringField(item, "companyName", 200),
      position: countField(item, "position")!, rowId: nullableString(item, "rowId", 30), sourceSelector: stringField(item, "sourceSelector", 100) };
  });
  if (!Array.isArray(value.promotedCandidates) || value.promotedCandidates.length > JOBKOREA_PROMOTED_SAMPLE_LIMIT
    || !Array.isArray(value.rejectedCandidates) || value.rejectedCandidates.length > JOBKOREA_REJECTED_SAMPLE_LIMIT) fail("excluded candidate sample limit이 유효하지 않습니다.");
  const promotedCandidates = value.promotedCandidates.map((item) => excludedCandidate(item, true));
  const rejectedCandidates = value.rejectedCandidates.map((item) => excludedCandidate(item, false));
  if (!isPlainRecord(value.diagnosticSamples)) fail("diagnosticSamples가 유효하지 않습니다.");
  const sampleLimits = { ordinary: JOBKOREA_ORDINARY_SAMPLE_LIMIT, promoted: JOBKOREA_PROMOTED_SAMPLE_LIMIT, rejected: JOBKOREA_REJECTED_SAMPLE_LIMIT } as const;
  const diagnosticSamples = { ordinary: [] as JobKoreaCandidateDiagnosticSample[], promoted: [] as JobKoreaCandidateDiagnosticSample[], rejected: [] as JobKoreaCandidateDiagnosticSample[], ordinaryTruncated: false, promotedTruncated: false, rejectedTruncated: false };
  for (const key of ["ordinary", "promoted", "rejected"] as const) {
    const samples = value.diagnosticSamples[key];
    if (!Array.isArray(samples) || samples.length > sampleLimits[key]) fail(`${key} diagnostic sample limit이 유효하지 않습니다.`);
    diagnosticSamples[key] = samples.map(diagnosticSample);
    const truncatedKey = `${key}Truncated` as const;
    if (typeof value.diagnosticSamples[truncatedKey] !== "boolean") fail(`${truncatedKey}가 boolean이 아닙니다.`);
    diagnosticSamples[truncatedKey] = value.diagnosticSamples[truncatedKey] as boolean;
  }
  if (!Array.isArray(value.containerSignatures) || value.containerSignatures.length > JOBKOREA_CONTAINER_SIGNATURE_LIMIT || typeof value.containerSignaturesTruncated !== "boolean") fail("container signature collection이 유효하지 않습니다.");
  const containerSignatures = value.containerSignatures.map(containerSummary);
  if (!value.extractionCompleted && (EVIDENCE_KEYS.some((key) => evidence[key] !== null) || ordinaryCandidates.length || promotedCandidates.length || rejectedCandidates.length)) fail("미완료 snapshot에 측정값이 있습니다.");
  return {
    schemaVersion: 2, serializedSnapshotBytes, finalUrl: stringField(value, "finalUrl", 2_048), pageTitle: stringField(value, "pageTitle", 500),
    documentReadyState: readyState as JobKoreaDocumentReadyState, extractionCompleted: value.extractionCompleted,
    extractionDurationMs: value.extractionDurationMs as number | null, readiness, domChangedAfterReadiness: value.domChangedAfterReadiness as boolean | null,
    evidence, rejectionReasonCounts, promotionSignalCounts, ordinaryCandidates, promotedCandidates, rejectedCandidates, diagnosticSamples,
    containerSignatures, containerSignaturesTruncated: value.containerSignaturesTruncated, diagnostics: diagnosticArray(value.diagnostics),
  };
}

function withExactSerializedBytes(value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  const candidate = { ...value, serializedSnapshotBytes: 0 };
  for (let index = 0; index < 8; index += 1) {
    const bytes = Buffer.byteLength(JSON.stringify(candidate), "utf8");
    if (candidate.serializedSnapshotBytes === bytes) return candidate;
    candidate.serializedSnapshotBytes = bytes;
  }
  return candidate;
}

export function validateAndRoundTripJobKoreaSnapshot(value: unknown, maximumBytes = JOBKOREA_SNAPSHOT_MAX_BYTES): JobKoreaPageSnapshot {
  assertJsonSafe(value);
  const measured = withExactSerializedBytes(value);
  let serialized: string;
  try { serialized = JSON.stringify(measured); } catch (error) { throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED", "snapshot JSON 직렬화에 실패했습니다.", { cause: error }); }
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_TOO_LARGE", `snapshot이 ${maximumBytes} byte 제한을 초과했습니다.`);
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch (error) { throw new JobKoreaSnapshotError("JOBKOREA_SNAPSHOT_SERIALIZATION_FAILED", "snapshot JSON round-trip에 실패했습니다.", { cause: error }); }
  return validateJobKoreaPageSnapshot(parsed);
}

export const JOBKOREA_PAGE_READINESS_EVALUATOR_SOURCE = String.raw`(() => {
  const ordinarySelectors = "tr.devloopArea[data-gno], .list-default, .recruit-info, .recruit-list, .search-list, .list-post, [class*='recruit-list'], [class*='search-list']";
  const text = String(document.body?.innerText ?? "").slice(0, 200000);
  const numericDetailLinkCount = Array.from(document.querySelectorAll('a[href*="/Recruit/GI_Read"]')).filter((node) => /\/Recruit\/GI_Read\/\d+(?:[/?#]|$)/i.test(node.getAttribute("href") ?? "")).length;
  const ordinaryContainerCount = document.querySelectorAll(ordinarySelectors).length;
  let reason = "unknown";
  if (numericDetailLinkCount > 0) reason = "numeric_detail_link";
  else if (ordinaryContainerCount > 0) reason = "ordinary_container";
  else if (/검색\s*결과가\s*없|채용정보가\s*없/.test(text)) reason = "no_result";
  else if (/로그인이\s*필요|회원\s*로그인/.test(text)) reason = "login";
  else if (/captcha|자동입력\s*방지/i.test(text)) reason = "captcha";
  else if (/본인\s*확인|보안\s*확인|verification/i.test(text)) reason = "verification";
  else if (/접근이\s*차단|access\s*denied|비정상적인\s*접근/i.test(text)) reason = "access_denied";
  return { reason, numericDetailLinkCount, ordinaryContainerCount };
})()`;

// Literal source prevents tsx/esbuild helpers from leaking into the page realm.
export const JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE = String.raw`(() => {
  const schemaVersion = 2;
  const ordinaryCandidateLimit = 200, ordinarySampleLimit = 10, promotedSampleLimit = 10, rejectedSampleLimit = 20, signatureLimit = 20, ancestorLimit = 8, promotionAncestorLimit = 6;
  const ordinarySelectors = "tr.devloopArea[data-gno], .list-default, .recruit-info, .recruit-list, .search-list, .list-post, [class*='recruit-list'], [class*='search-list']";
  const resultRootSelectors = "main, [role='main'], .list-default, .recruit-info, .recruit-list, .search-list, .list-post, [class*='recruit-list'], [class*='search-list']";
  const recommendationSelectors = "[class*='recommend'], [class*='attention']";
  const recentSelectors = "[class*='recent']";
  const exactPromotionClassTokens = new Set(["ad", "ads", "advertisement", "sponsor", "sponsored", "promoted"]);
  const promotionDataValues = new Set(["ad", "advertisement", "sponsored", "promoted"]);
  const promotionDataNames = ["data-type", "data-section", "data-track"];
  const dataAllowlist = ["data-gno", "data-gir-no", "data-recruit-no", "data-job-id", "data-id", "data-type", "data-section", "data-tab", "data-track", "data-sentry-component"];
  const compact = (input, maximum) => String(input ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
  const promotionClassToken = (token) => { const value=compact(token,100).toLowerCase(); return exactPromotionClassTokens.has(value)||/^(?:ad|sponsored|promoted)[-_][a-z0-9]/.test(value); };
  const promotionAttributeValue = (value) => compact(value,200).toLowerCase().split(/[\s,|]+/).filter(Boolean).some((token)=>promotionDataValues.has(token));
  const directSemanticPromotionLabel = (element) => { if(!(element instanceof Element)) return false; const direct=Array.from(element.childNodes).filter((node)=>node.nodeType===Node.TEXT_NODE).map((node)=>node.textContent??"").join(" "); const labels=[direct,element.getAttribute("aria-label")??""]; return labels.some((value)=>/^(?:ad|광고|sponsored)$/i.test(compact(value,50))); };
  const explicitPromotionSignal = (element) => { if(!(element instanceof Element)) return null; if(Array.from(element.classList).some(promotionClassToken)) return "exact_class_token"; for(const name of promotionDataNames){const value=element.getAttribute(name);if(value!==null&&promotionAttributeValue(value))return "data_attribute";} if(directSemanticPromotionLabel(element))return "semantic_label"; return null; };
  const promotionEvidence = (anchor) => { let current=anchor,depth=0; while(current instanceof Element&&depth<=promotionAncestorLimit){ if(current.tagName==="BODY"||current.tagName==="MAIN")break; const signal=explicitPromotionSignal(current); if(signal)return {element:current,signal,depth}; current=current.parentElement; depth+=1; } return null; };
  const emptyEvidence = () => ({ ordinaryContainerCount:null, ordinaryRowCount:null, resultRootCount:null, knownTableResultCount:null, knownListResultCount:null, knownCardResultCount:null,numericLinksInsideKnownTableResults:null,numericLinksInsideKnownListResults:null,numericLinksInsideKnownCardResults:null,ordinaryDetailLinkCount:null, allNumericDetailLinkCount:null, promotedContainerCount:null, recommendationContainerCount:null, recentViewContainerCount:null, promotedDetailLinkCount:null, rejectedDetailLinkCount:null, numericLinksInsideKnownResultRoots:null, numericLinksOutsideKnownResultRoots:null, noResultMarkerCount:null, loginMarkerCount:null, captchaMarkerCount:null, verificationMarkerCount:null, accessDeniedMarkerCount:null });
  const marker = (element, pattern) => element instanceof Element && pattern.test(compact((element.id ?? "") + " " + (element.getAttribute("class") ?? ""), 1000));
  const signature = (element, depth) => {
    const classes = element instanceof Element ? Array.from(element.classList).map((item) => compact(item, 50)).filter(Boolean).sort().slice(0, 8) : [];
    const dataAttributes = {};
    if (element instanceof Element) for (const name of dataAllowlist) { const value = element.getAttribute(name); if (value !== null) dataAttributes[name] = compact(value, 100); }
    return { tag: element instanceof Element ? element.tagName.toLowerCase() : "unknown", id: element instanceof Element && element.id ? compact(element.id, 100) : null,
      classes, role: element instanceof Element ? (element.getAttribute("role") ? compact(element.getAttribute("role"), 50) : null) : null,
      dataAttributes, ariaLabelPresent: element instanceof Element && element.hasAttribute("aria-label"), depthFromAnchor: depth,
      childElementCount: element instanceof Element ? element.childElementCount : 0,
      numericDetailLinkCount: element instanceof Element ? Array.from(element.querySelectorAll('a[href*="/Recruit/GI_Read"]')).filter((node) => /\/Recruit\/GI_Read\/\d+(?:[/?#]|$)/i.test(node.getAttribute("href") ?? "")).length : 0,
      hasKnownOrdinaryMarker: element instanceof Element && (element.matches("tr.devloopArea[data-gno]") || element.matches(ordinarySelectors)),
      hasPromotedMarker: Boolean(explicitPromotionSignal(element)),
      hasRecommendationMarker: marker(element, /recommend|attention/i), hasRecentViewMarker: marker(element, /recent/i) };
  };
  const ancestorChain = (anchor) => { const result=[]; let current=anchor.parentElement; let depth=1; while(current && depth<=ancestorLimit){ result.push(signature(current,depth)); if(current.tagName==="BODY" || current.tagName==="MAIN" || current.matches(resultRootSelectors)) break; current=current.parentElement; depth+=1; } return result; };
  const structureKind = (anchor) => anchor.closest("table") ? "table" : anchor.closest("ul,ol,li") ? "list" : anchor.closest("article") ? "article" : anchor.closest("section") ? "section" : anchor.closest("div") ? "div" : "other";
  const signatureKey = (item) => { const classPart=item.classes.length ? "."+item.classes.join(".") : ""; const dataPart=Object.keys(item.dataAttributes).sort().map((key)=>"["+key+"]").join(""); const rolePart=item.role ? "[role="+item.role+"]" : ""; return compact(item.tag+classPart+dataPart+rolePart+"@"+item.depthFromAnchor,500); };
  try {
    const extractionStarted = performance.now();
    const bodyText = compact(document.body?.innerText, 200000);
    const detailNodes = Array.from(document.querySelectorAll('a[href*="/Recruit/GI_Read"]'));
    const ordinaryCandidates=[], promotedCandidates=[], rejectedCandidates=[], diagnostics=[];
    const diagnosticSamples={ordinary:[],promoted:[],rejected:[],ordinaryTruncated:false,promotedTruncated:false,rejectedTruncated:false};
    const rejectionCounts={}, promotionSignalCounts={}, signatureAggregates={};
    const explicitPromotedElements=new Set();
    let allNumericDetailLinkCount=0, ordinaryDetailLinkCount=0, promotedDetailLinkCount=0, rejectedDetailLinkCount=0;
    const resultRoots=Array.from(document.querySelectorAll(resultRootSelectors));
    const withinRoot=(node)=>resultRoots.some((root)=>root===node || root.contains(node));
    const addReason=(reason)=>{ rejectionCounts[reason]=(rejectionCounts[reason]??0)+1; };
    const addSummary=(container,classification,postingId)=>{ const item=signature(container,1), key=signatureKey(item); if(!signatureAggregates[key]) signatureAggregates[key]={signatureKey:key,count:0,candidateClassifications:{ordinary:0,promoted:0,rejected:0},samplePostingIds:[],signature:item}; const summary=signatureAggregates[key]; summary.count+=1; summary.candidateClassifications[classification]+=1; if(postingId && summary.samplePostingIds.length<3 && !summary.samplePostingIds.includes(postingId)) summary.samplePostingIds.push(postingId); };
    const addSample=(classification,anchor,postingId,href,reason,promotionSignal,position,flags)=>{ const list=diagnosticSamples[classification], limit=classification==="ordinary"?ordinarySampleLimit:classification==="promoted"?promotedSampleLimit:rejectedSampleLimit; if(list.length>=limit){ diagnosticSamples[classification+"Truncated"]=true; return; } list.push({postingId,href,classification,primaryReason:reason,promotionSignal,sourcePosition:position,anchor:signature(anchor,0),ancestors:ancestorChain(anchor),insideKnownResultRoot:flags.resultRoot,insideKnownOrdinaryRow:flags.row,insidePromotedRegion:flags.promoted,insideRecommendationRegion:flags.recommendation,insideRecentViewRegion:flags.recent,structureKind:structureKind(anchor)}); };
    for(let index=0;index<detailNodes.length;index+=1){
      const node=detailNodes[index], position=index+1, rawHref=node instanceof Element?node.getAttribute("href"):null;
      if(!(node instanceof HTMLAnchorElement)){ rejectedDetailLinkCount+=1; addReason("SVG_ANCHOR_UNSUPPORTED"); if(rejectedCandidates.length<rejectedSampleLimit) rejectedCandidates.push({postingId:null,href:rawHref?compact(rawHref,2048):null,reason:"SVG_ANCHOR_UNSUPPORTED"}); continue; }
      if(!node.isConnected){ rejectedDetailLinkCount+=1; addReason("DETACHED_DURING_EXTRACTION"); continue; }
      let parsed=null; try{parsed=new URL(node.href);}catch{parsed=null;}
      const pathId=parsed?/^\/Recruit\/GI_Read\/(\d+)\/?$/i.exec(parsed.pathname)?.[1]??null:null;
      const anyId=/\/Recruit\/GI_Read\/(\d+)(?:[/?#]|$)/i.exec(node.href)?.[1]??null;
      const postingId=pathId??anyId;
      if(postingId) allNumericDetailLinkCount+=1;
      const row=node.closest("tr.devloopArea[data-gno]"), ordinaryRoot=node.closest(ordinarySelectors), resultRoot=withinRoot(node), unrelated=Boolean(node.closest("header,footer,aside,nav"));
      const recommendationRoot=node.closest(recommendationSelectors), recentRoot=node.closest(recentSelectors), promotedEvidence=promotionEvidence(node);
      const container=row??node.closest("li,article,section,div,tr")??node.parentElement??node;
      const containerText=compact(container.textContent,1000);
      const recommendation=Boolean(recommendationRoot)||/지금\s*주목할\s*만한\s*공고|추천\s*공고/.test(containerText);
      const recent=Boolean(recentRoot)||/최근\s*본\s*공고/.test(containerText);
      const promoted=Boolean(promotedEvidence); if(promotedEvidence)explicitPromotedElements.add(promotedEvidence.element);
      const flags={resultRoot,row:Boolean(row),promoted,recommendation,recent};
      let rejection=null;
      if(!parsed) rejection="INVALID_DETAIL_PATH";
      else if(!["www.jobkorea.co.kr","m.jobkorea.co.kr"].includes(parsed.hostname)) rejection="DISALLOWED_HOST";
      else if(!pathId && anyId) rejection="TRACKING_REDIRECT";
      else if(!postingId) rejection="INVALID_POSTING_ID";
      else if(recent) rejection="INSIDE_RECENT_VIEW_REGION";
      else if(recommendation) rejection="INSIDE_RECOMMENDATION_REGION";
      if(rejection){ rejectedDetailLinkCount+=1; addReason(rejection); const href=parsed&&pathId?"https://www.jobkorea.co.kr/Recruit/GI_Read/"+pathId:(parsed?compact(parsed.origin+parsed.pathname,2048):null); if(rejectedCandidates.length<rejectedSampleLimit) rejectedCandidates.push({postingId,href,reason:rejection}); addSample("rejected",node,postingId,href,rejection,null,position,flags); addSummary(container,"rejected",postingId); continue; }
      const href="https://www.jobkorea.co.kr/Recruit/GI_Read/"+postingId;
      if(promoted){ promotedDetailLinkCount+=1; promotionSignalCounts[promotedEvidence.signal]=(promotionSignalCounts[promotedEvidence.signal]??0)+1; if(promotedCandidates.length<promotedSampleLimit) promotedCandidates.push({postingId,href,reason:"INSIDE_PROMOTED_REGION"}); addSample("promoted",node,postingId,href,"INSIDE_PROMOTED_REGION",promotedEvidence.signal,position,flags); addSummary(container,"promoted",postingId); continue; }
      if(unrelated) rejection="INSIDE_UNRELATED_WIDGET";
      else if(!(row||(ordinaryRoot&&!recommendationRoot&&!recentRoot))) rejection=resultRoot?"ANCESTOR_SIGNATURE_UNRECOGNIZED":"OUTSIDE_RESULT_ROOT";
      if(rejection){ rejectedDetailLinkCount+=1; addReason(rejection); if(rejectedCandidates.length<rejectedSampleLimit) rejectedCandidates.push({postingId,href,reason:rejection}); addSample("rejected",node,postingId,href,rejection,null,position,flags); addSummary(container,"rejected",postingId); continue; }
      ordinaryDetailLinkCount+=1;
      if(ordinaryCandidates.length<ordinaryCandidateLimit){ const company=container.querySelector(".name,.company,[class*='company'],[class*='corp']"); ordinaryCandidates.push({postingId,href,title:compact(node.textContent,300),companyName:compact(company?.textContent,200),position:ordinaryCandidates.length+1,rowId:row?.getAttribute("data-gno")?compact(row.getAttribute("data-gno"),30):null,sourceSelector:row?"tr.devloopArea[data-gno]":"ordinary_result_container"}); }
      addSample("ordinary",node,postingId,href,null,null,position,flags); addSummary(container,"ordinary",postingId);
    }
    const sortedRejectionCounts={}; for(const key of Object.keys(rejectionCounts).sort()) if(rejectionCounts[key]>0) sortedRejectionCounts[key]=rejectionCounts[key];
    const sortedPromotionSignalCounts={}; for(const key of Object.keys(promotionSignalCounts).sort()) if(promotionSignalCounts[key]>0) sortedPromotionSignalCounts[key]=promotionSignalCounts[key];
    const allSummaries=Object.values(signatureAggregates).sort((a,b)=>b.count-a.count||a.signatureKey.localeCompare(b.signatureKey));
    const containerSignaturesTruncated=allSummaries.length>signatureLimit, containerSignatures=allSummaries.slice(0,signatureLimit);
    const legacyBroadPromotedCount=document.querySelectorAll("[class*='ad'], [class*='sponsor']").length;
    if(legacyBroadPromotedCount>explicitPromotedElements.size) diagnostics.push({code:"JOBKOREA_PROMOTED_CLASS_SUBSTRING_OVERMATCH",message:"legacy broad class matches="+legacyBroadPromotedCount+", explicit promoted containers="+explicitPromotedElements.size});
    if(containerSignaturesTruncated) diagnostics.push({code:"JOBKOREA_CONTAINER_SIGNATURES_TRUNCATED",message:"container signature summaries exceeded limit="+signatureLimit});
    if(diagnosticSamples.rejectedTruncated) diagnostics.push({code:"JOBKOREA_REJECTED_SAMPLES_TRUNCATED",message:"rejected diagnostic samples exceeded limit="+rejectedSampleLimit});
    if(diagnosticSamples.promotedTruncated||diagnosticSamples.ordinaryTruncated) diagnostics.push({code:"JOBKOREA_CANDIDATE_SAMPLES_TRUNCATED",message:"candidate diagnostic samples were truncated"});
    const noResult=/검색\s*결과가\s*없|채용정보가\s*없|조건에\s*맞는\s*공고가\s*없/.test(bodyText)?1:0;
    const login=/로그인이\s*필요|회원\s*로그인/.test(bodyText)?1:0, captcha=/captcha|자동입력\s*방지|로봇이\s*아닙니다/i.test(bodyText)?1:0;
    const verification=/본인\s*확인|보안\s*확인|verification/i.test(bodyText)?1:0, accessDenied=/접근이\s*차단|access\s*denied|비정상적인\s*접근|권한이\s*없습니다/i.test(bodyText)?1:0;
    if(allNumericDetailLinkCount>0&&ordinaryDetailLinkCount===0&&!noResult&&!login&&!captcha&&!verification&&!accessDenied&&(sortedRejectionCounts.ANCESTOR_SIGNATURE_UNRECOGNIZED||sortedRejectionCounts.OUTSIDE_RESULT_ROOT||sortedRejectionCounts.NO_ORDINARY_ANCESTOR)) diagnostics.push({code:"JOBKOREA_ORDINARY_CONTAINER_CONTRACT_MISMATCH",message:"numeric="+allNumericDetailLinkCount+", rejected="+rejectedDetailLinkCount+", ordinary=0"});
    const tableResults=Array.from(document.querySelectorAll("table")).filter((node)=>withinRoot(node)&&node.querySelector('a[href*="/Recruit/GI_Read"]')).length;
    const listResults=Array.from(document.querySelectorAll("ul,ol")).filter((node)=>withinRoot(node)&&node.querySelector('a[href*="/Recruit/GI_Read"]')).length;
    const cardResults=Array.from(document.querySelectorAll("article")).filter((node)=>withinRoot(node)&&node.querySelector('a[href*="/Recruit/GI_Read"]')).length;
    const numericNodes=detailNodes.filter((node)=>node instanceof Element&&/\/Recruit\/GI_Read\/\d+(?:[/?#]|$)/i.test(node.getAttribute("href")??""));
    const insideCount=numericNodes.filter(withinRoot).length;
    const numericInTables=numericNodes.filter((node)=>Boolean(node.closest("table"))&&withinRoot(node)).length;
    const numericInLists=numericNodes.filter((node)=>Boolean(node.closest("ul,ol"))&&withinRoot(node)).length;
    const numericInCards=numericNodes.filter((node)=>Boolean(node.closest("article"))&&withinRoot(node)).length;
    return {schemaVersion,serializedSnapshotBytes:0,finalUrl:String(location.href),pageTitle:compact(document.title,500),documentReadyState:["loading","interactive","complete"].includes(document.readyState)?document.readyState:"unknown",extractionCompleted:true,extractionDurationMs:Math.max(0,performance.now()-extractionStarted),readiness:null,domChangedAfterReadiness:null,
      evidence:{ordinaryContainerCount:document.querySelectorAll(ordinarySelectors).length,ordinaryRowCount:document.querySelectorAll("tr.devloopArea[data-gno]").length,resultRootCount:resultRoots.length,knownTableResultCount:tableResults,knownListResultCount:listResults,knownCardResultCount:cardResults,numericLinksInsideKnownTableResults:numericInTables,numericLinksInsideKnownListResults:numericInLists,numericLinksInsideKnownCardResults:numericInCards,ordinaryDetailLinkCount,allNumericDetailLinkCount,promotedContainerCount:explicitPromotedElements.size,recommendationContainerCount:document.querySelectorAll(recommendationSelectors).length,recentViewContainerCount:document.querySelectorAll(recentSelectors).length,promotedDetailLinkCount,rejectedDetailLinkCount,numericLinksInsideKnownResultRoots:insideCount,numericLinksOutsideKnownResultRoots:numericNodes.length-insideCount,noResultMarkerCount:noResult,loginMarkerCount:login,captchaMarkerCount:captcha,verificationMarkerCount:verification,accessDeniedMarkerCount:accessDenied},
      rejectionReasonCounts:sortedRejectionCounts,promotionSignalCounts:sortedPromotionSignalCounts,ordinaryCandidates,promotedCandidates,rejectedCandidates,diagnosticSamples,containerSignatures,containerSignaturesTruncated,diagnostics};
  }catch(error){const message=error instanceof Error?error.message:String(error);return {schemaVersion,serializedSnapshotBytes:0,finalUrl:String(location.href),pageTitle:compact(document.title,500),documentReadyState:["loading","interactive","complete"].includes(document.readyState)?document.readyState:"unknown",extractionCompleted:false,extractionDurationMs:null,readiness:null,domChangedAfterReadiness:null,evidence:emptyEvidence(),rejectionReasonCounts:{},promotionSignalCounts:{},ordinaryCandidates:[],promotedCandidates:[],rejectedCandidates:[],diagnosticSamples:{ordinary:[],promoted:[],rejected:[],ordinaryTruncated:false,promotedTruncated:false,rejectedTruncated:false},containerSignatures:[],containerSignaturesTruncated:false,diagnostics:[{code:"JOBKOREA_SNAPSHOT_EVALUATION_FAILED",message:compact(message,500)||"page context snapshot extraction failed"}]};}
})()`;

export async function captureJobKoreaReadinessEvidence(page: Page): Promise<JobKoreaReadinessEvidence> {
  const value: unknown = await page.evaluate(JOBKOREA_PAGE_READINESS_EVALUATOR_SOURCE);
  if (!isPlainRecord(value)) fail("readiness snapshot이 malformed입니다.");
  const reason = stringField(value, "reason", 40);
  if (!READINESS_REASONS.has(reason)) fail("readiness reason이 유효하지 않습니다.");
  return { reason: reason as JobKoreaReadinessEvidence["reason"], numericDetailLinkCount: countField(value, "numericDetailLinkCount")!, ordinaryContainerCount: countField(value, "ordinaryContainerCount")! };
}

export async function captureJobKoreaPageSnapshot(page: Page, readiness: JobKoreaReadinessEvidence | null = null): Promise<JobKoreaPageSnapshot> {
  let raw: unknown;
  try { raw = await page.evaluate(JOBKOREA_PAGE_SNAPSHOT_EVALUATOR_SOURCE); }
  catch (error) {
    const message = (error instanceof Error ? error.message : "Playwright page.evaluate 실패").split(/\r?\n/, 1)[0]!.slice(0, 500);
    const code = /Execution context was destroyed|Target page, context or browser has been closed/i.test(message)
      ? "JOBKOREA_SNAPSHOT_EXECUTION_CONTEXT_DESTROYED" : /\b__name is not defined\b/.test(message)
        ? "JOBKOREA_SNAPSHOT_TRANSFORM_HELPER_MISSING" : "JOBKOREA_SNAPSHOT_EVALUATION_FAILED";
    throw new JobKoreaSnapshotError(code, message, { cause: error });
  }
  if (!isPlainRecord(raw) || !isPlainRecord(raw.evidence)) return validateAndRoundTripJobKoreaSnapshot(raw);
  const snapshotNumeric = raw.evidence.allNumericDetailLinkCount;
  const snapshotOrdinary = raw.evidence.ordinaryContainerCount;
  const domChanged = readiness === null || typeof snapshotNumeric !== "number" || typeof snapshotOrdinary !== "number" ? null
    : readiness.numericDetailLinkCount !== snapshotNumeric || readiness.ordinaryContainerCount !== snapshotOrdinary;
  const diagnostics = Array.isArray(raw.diagnostics) ? [...raw.diagnostics] : [];
  if (domChanged) diagnostics.push({ code: "JOBKOREA_READINESS_SNAPSHOT_DOM_CHANGED", message: `readiness numeric=${readiness!.numericDetailLinkCount}, snapshot numeric=${snapshotNumeric}; readiness ordinary=${readiness!.ordinaryContainerCount}, snapshot ordinary=${snapshotOrdinary}` });
  return validateAndRoundTripJobKoreaSnapshot({ ...raw, readiness, domChangedAfterReadiness: domChanged, diagnostics });
}
