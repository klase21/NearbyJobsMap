export const EXCLUSION_FIELDS = ["title", "company", "location", "category", "employment_type", "work_schedule"] as const;
export type ExclusionField = typeof EXCLUSION_FIELDS[number];

export interface CollectionExclusionConfig {
  keywords: string[];
  fields: ExclusionField[];
}

export interface ExclusionCandidateText {
  postingId: string;
  listingPage: number;
  sourcePosition: number;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  categories?: readonly string[] | null;
  employmentTypes?: readonly string[] | null;
  workSchedule?: readonly string[] | null;
}

export interface ExcludedCandidateSample {
  postingId: string;
  matchedKeyword: string;
  matchedField: ExclusionField;
  listingPage: number;
  sourcePosition: number;
}

export interface ExclusionSummary {
  candidatesBeforeExclusion: number;
  candidatesExcluded: number;
  candidatesAfterExclusion: number;
  exclusionReasonCounts: {
    byKeyword: Record<string, number>;
    byField: Partial<Record<ExclusionField, number>>;
    byKeywordAndField: Record<string, number>;
  };
  excludedCandidateSamples: ExcludedCandidateSample[];
  exclusionSamplesTruncated: boolean;
}

export const MAX_EXCLUSION_KEYWORDS = 30;
export const MIN_EXCLUSION_KEYWORD_LENGTH = 2;
export const MAX_EXCLUSION_KEYWORD_LENGTH = 50;
export const MAX_EXCLUSION_SAMPLES = 20;
export const DEFAULT_EXCLUSION_FIELDS: ExclusionField[] = ["title", "category"];
const FIELD_SET = new Set<string>(EXCLUSION_FIELDS);

export class CollectionExclusionValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "CollectionExclusionValidationError"; }
}

export function normalizeExclusionText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function normalizeCollectionExclusionConfig(value?: Partial<CollectionExclusionConfig> | null): CollectionExclusionConfig {
  const rawKeywords = value?.keywords ?? [];
  const rawFields = value?.fields ?? [];
  if (!Array.isArray(rawKeywords) || !rawKeywords.every((item) => typeof item === "string")) {
    throw new CollectionExclusionValidationError("COLLECTION_EXCLUSION_KEYWORDS_INVALID", "제외 키워드는 문자열 배열이어야 합니다.");
  }
  if (rawKeywords.length > MAX_EXCLUSION_KEYWORDS) {
    throw new CollectionExclusionValidationError("COLLECTION_EXCLUSION_KEYWORD_LIMIT", `제외 키워드는 최대 ${MAX_EXCLUSION_KEYWORDS}개까지 사용할 수 있습니다.`);
  }
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawKeywords) {
    const keyword = normalizeExclusionText(raw);
    if (!keyword) continue;
    if (keyword.length < MIN_EXCLUSION_KEYWORD_LENGTH) throw new CollectionExclusionValidationError("COLLECTION_EXCLUSION_KEYWORD_TOO_SHORT", `제외 키워드는 ${MIN_EXCLUSION_KEYWORD_LENGTH}자 이상이어야 합니다.`);
    if (keyword.length > MAX_EXCLUSION_KEYWORD_LENGTH) throw new CollectionExclusionValidationError("COLLECTION_EXCLUSION_KEYWORD_TOO_LONG", `제외 키워드는 ${MAX_EXCLUSION_KEYWORD_LENGTH}자를 넘을 수 없습니다.`);
    if (!seen.has(keyword)) { seen.add(keyword); keywords.push(keyword); }
  }
  if (!Array.isArray(rawFields) || !rawFields.every((item) => typeof item === "string" && FIELD_SET.has(item))) {
    throw new CollectionExclusionValidationError("COLLECTION_EXCLUSION_FIELD_INVALID", "지원하지 않는 제외 필드가 포함되어 있습니다.");
  }
  const fields = keywords.length
    ? [...new Set((rawFields.length ? rawFields : DEFAULT_EXCLUSION_FIELDS) as ExclusionField[])]
    : [];
  return { keywords, fields };
}

export function canonicalizeExclusionConfig(config: CollectionExclusionConfig): string {
  const normalized = normalizeCollectionExclusionConfig(config);
  return JSON.stringify({ keywords: normalized.keywords, fields: normalized.fields });
}

function fieldValues(candidate: ExclusionCandidateText, field: ExclusionField): readonly (string | null | undefined)[] {
  switch (field) {
    case "title": return [candidate.title];
    case "company": return [candidate.company];
    case "location": return [candidate.location];
    case "category": return candidate.categories ?? [];
    case "employment_type": return candidate.employmentTypes ?? [];
    case "work_schedule": return candidate.workSchedule ?? [];
  }
}

export function matchCandidateExclusion(candidate: ExclusionCandidateText, config: CollectionExclusionConfig): ExcludedCandidateSample | null {
  for (const keyword of config.keywords) {
    for (const field of config.fields) {
      if (fieldValues(candidate, field).some((value) => typeof value === "string" && normalizeExclusionText(value).includes(keyword))) {
        return { postingId: candidate.postingId, matchedKeyword: keyword, matchedField: field, listingPage: candidate.listingPage, sourcePosition: candidate.sourcePosition };
      }
    }
  }
  return null;
}

const sortedRecord = (counts: Map<string, number>): Record<string, number> => Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")));

export function applyCandidateExclusions<T>(candidates: T[], configInput: CollectionExclusionConfig,
  toText: (candidate: T) => ExclusionCandidateText): { candidates: T[]; summary: ExclusionSummary } {
  const config = normalizeCollectionExclusionConfig(configInput);
  const retained: T[] = []; const samples: ExcludedCandidateSample[] = [];
  const keywords = new Map<string, number>(); const fields = new Map<string, number>(); const pairs = new Map<string, number>();
  let excluded = 0;
  for (const candidate of candidates) {
    const match = matchCandidateExclusion(toText(candidate), config);
    if (!match) { retained.push(candidate); continue; }
    excluded += 1;
    keywords.set(match.matchedKeyword, (keywords.get(match.matchedKeyword) ?? 0) + 1);
    fields.set(match.matchedField, (fields.get(match.matchedField) ?? 0) + 1);
    const pair = `${match.matchedKeyword}:${match.matchedField}`;
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    if (samples.length < MAX_EXCLUSION_SAMPLES) samples.push(match);
  }
  return { candidates: retained, summary: { candidatesBeforeExclusion: candidates.length, candidatesExcluded: excluded,
    candidatesAfterExclusion: retained.length, exclusionReasonCounts: { byKeyword: sortedRecord(keywords),
      byField: sortedRecord(fields) as Partial<Record<ExclusionField, number>>, byKeywordAndField: sortedRecord(pairs) },
    excludedCandidateSamples: samples, exclusionSamplesTruncated: excluded > samples.length } };
}

export function splitExclusionKeywordInput(value: string): string[] {
  return value.split(/[,\r\n]+/u).map((item) => item.trim()).filter(Boolean);
}
