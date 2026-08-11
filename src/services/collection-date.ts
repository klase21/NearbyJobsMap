export const COLLECTION_TIMEZONE = "Asia/Seoul" as const;

export type PostingDateStatus = "today" | "older" | "future_invalid" | "unknown";
export type SourcePostingDateKind = "absolute_date" | "relative_today" | "relative_age" | "unknown";
export type SourcePostingDateField = "listing_registered" | "listing_posted_at";
export interface SourcePostingDateEvidence {
  raw: string | null;
  kind: SourcePostingDateKind;
  sourceField: SourcePostingDateField;
}
export type CollectionDateScope =
  | { type: "today"; timezone: typeof COLLECTION_TIMEZONE; resolvedDate: string }
  | { type: "all" };

export interface PostingDateClassification {
  status: PostingDateStatus;
  evidence: string | null;
  resolvedDate: string | null;
  estimatedPostedAt?: string | null;
  evidenceKind?: SourcePostingDateKind;
  midnightAmbiguous?: boolean;
}

export interface ResolvedPostingDateEvidence extends PostingDateClassification {
  onOrAfterCutoff: boolean | null;
}

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: COLLECTION_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function koreaCalendarDate(value: Date): string {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function resolveTodayScope(now = new Date()): Extract<CollectionDateScope, { type: "today" }> {
  return { type: "today", timezone: COLLECTION_TIMEZONE, resolvedDate: koreaCalendarDate(now) };
}

function compareDate(value: string, runDate: string): PostingDateStatus {
  if (value === runDate) return "today";
  return value < runDate ? "older" : "future_invalid";
}

const ABSOLUTE_DATE = /^(?:20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}|\d{1,2}[.\-/]\d{1,2})(?:\s*(?:\([^)]*\)\s*)?등록)?$/u;
const RELATIVE_TODAY = /^(?:오늘|방금)(?:\s*등록)?$/u;
const RELATIVE_AGE = /^(?:(?:\d{1,4}\s*분\s*전|\d{1,3}\s*시간\s*전|어제|\d+\s*일\s*전)(?:\s*등록)?)$/u;

export function createSourcePostingDateEvidence(raw: string | null | undefined, sourceField: SourcePostingDateField): SourcePostingDateEvidence {
  const value = raw?.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 50) || null;
  const kind: SourcePostingDateKind = !value ? "unknown" : RELATIVE_TODAY.test(value) ? "relative_today"
    : RELATIVE_AGE.test(value) ? "relative_age" : ABSOLUTE_DATE.test(value) ? "absolute_date" : "unknown";
  return { raw: kind === "unknown" ? null : value, kind, sourceField };
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function classifyPostingDateEvidence(raw: string | null | undefined, runDate: string): PostingDateClassification {
  const evidence = raw?.normalize("NFKC").replace(/\s+/gu, " ").trim() || null;
  if (!evidence) return { status: "unknown", evidence: null, resolvedDate: null };
  if (/^(?:오늘|방금|\d{1,3}\s*분\s*전|\d{1,2}\s*시간\s*전)$/u.test(evidence)) {
    return { status: "today", evidence, resolvedDate: runDate };
  }
  if (/^(?:어제|\d+\s*일\s*전)(?:\s*등록)?$/u.test(evidence)) return { status: "older", evidence, resolvedDate: null };
  const absolute = evidence.match(/(?:^|\D)(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\D|$)/u);
  if (absolute) {
    const year = Number(absolute[1]), month = Number(absolute[2]), day = Number(absolute[3]);
    const value = formatDate(year, month, day);
    const valid = validCalendarDate(year, month, day);
    return valid ? { status: compareDate(value, runDate), evidence, resolvedDate: value } : { status: "unknown", evidence, resolvedDate: null };
  }
  const short = evidence.match(/(?:^|\D)(\d{1,2})[.\-/](\d{1,2})(?:\D|$)/u);
  if (short) {
    let year = Number(runDate.slice(0, 4)); const month = Number(short[1]), day = Number(short[2]);
    if (!validCalendarDate(year, month, day)) return { status: "unknown", evidence, resolvedDate: null };
    let value = formatDate(year, month, day);
    const forwardDays = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${runDate}T00:00:00Z`)) / 86_400_000;
    if (forwardDays > 180) { year -= 1; value = formatDate(year, month, day); }
    const valid = validCalendarDate(year, month, day);
    return valid ? { status: compareDate(value, runDate), evidence, resolvedDate: value } : { status: "unknown", evidence, resolvedDate: null };
  }
  return { status: "unknown", evidence, resolvedDate: null };
}

const KOREA_OFFSET = "+09:00";

export function classifyPostingDateEvidenceAt(raw: string | null | undefined, observedAt: string, runDate: string): PostingDateClassification {
  const evidence = raw?.normalize("NFKC").replace(/\s+/gu, " ").trim() || null;
  const observedMs = Date.parse(observedAt);
  if (!evidence || !Number.isFinite(observedMs)) return { status: "unknown", evidence, resolvedDate: null, estimatedPostedAt: null, evidenceKind: "unknown" };
  if (/^방금(?:\s*등록)?$/u.test(evidence)) {
    return { status: "today", evidence, resolvedDate: runDate, estimatedPostedAt: new Date(observedMs).toISOString(), evidenceKind: "relative_today" };
  }
  if (/^오늘(?:\s*등록)?$/u.test(evidence)) {
    return { status: "today", evidence, resolvedDate: runDate, estimatedPostedAt: null, evidenceKind: "relative_today" };
  }
  const dayStartMs = Date.parse(`${runDate}T00:00:01${KOREA_OFFSET}`);
  const minutes = evidence.match(/^(\d{1,4})\s*분\s*전(?:\s*등록)?$/u);
  if (minutes) {
    const estimatedMs = observedMs - Number(minutes[1]) * 60_000;
    return { status: estimatedMs >= dayStartMs && estimatedMs <= observedMs ? "today" : "older", evidence,
      resolvedDate: estimatedMs >= dayStartMs ? runDate : koreaCalendarDate(new Date(estimatedMs)),
      estimatedPostedAt: new Date(estimatedMs).toISOString(), evidenceKind: "relative_age", midnightAmbiguous: false };
  }
  const hours = evidence.match(/^(\d{1,3})\s*시간\s*전(?:\s*등록)?$/u);
  if (hours) {
    const ageHours = Number(hours[1]);
    const latestPossibleMs = observedMs - ageHours * 3_600_000;
    const earliestPossibleMs = observedMs - (ageHours + 1) * 3_600_000;
    if (earliestPossibleMs >= dayStartMs) return { status: "today", evidence, resolvedDate: runDate,
      estimatedPostedAt: null, evidenceKind: "relative_age", midnightAmbiguous: false };
    if (latestPossibleMs < dayStartMs) return { status: "older", evidence, resolvedDate: koreaCalendarDate(new Date(latestPossibleMs)),
      estimatedPostedAt: null, evidenceKind: "relative_age", midnightAmbiguous: false };
    return { status: "unknown", evidence, resolvedDate: null, estimatedPostedAt: null, evidenceKind: "relative_age", midnightAmbiguous: true };
  }
  const classified = classifyPostingDateEvidence(evidence, runDate);
  return { ...classified, estimatedPostedAt: null,
    evidenceKind: classified.status === "unknown" ? "unknown" : /\d{1,2}[.\-/]\d{1,2}/u.test(evidence) ? "absolute_date" : "relative_age",
    midnightAmbiguous: false };
}

/** Resolves bounded source registration evidence against the page observation time, then compares its Korea date with a cutoff. */
export function resolvePostingDateAtCutoff(raw: string | null | undefined, observedAt: string, cutoffDate: string): ResolvedPostingDateEvidence {
  const observedDate = koreaCalendarDate(new Date(observedAt));
  const evidence = raw?.normalize("NFKC").replace(/\s+/gu, " ").trim() || null;
  const days = evidence?.match(/^(\d+)\s*일\s*전(?:\s*등록)?$/u);
  if (days) {
    const observedMidnight = Date.parse(`${observedDate}T00:00:00+09:00`);
    const resolvedDate = koreaCalendarDate(new Date(observedMidnight - Number(days[1]) * 86_400_000));
    return { status: resolvedDate === observedDate ? "today" : "older", evidence, resolvedDate, estimatedPostedAt: null,
      evidenceKind: "relative_age", midnightAmbiguous: false, onOrAfterCutoff: resolvedDate >= cutoffDate };
  }
  const classified = classifyPostingDateEvidenceAt(evidence, observedAt, observedDate);
  return { ...classified, onOrAfterCutoff: classified.resolvedDate ? classified.resolvedDate >= cutoffDate : null };
}
