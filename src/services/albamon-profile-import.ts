import {
  MAX_IMPORTED_EXCLUSION_KEYWORDS,
  MAX_EXCLUSION_KEYWORD_LENGTH,
  MIN_EXCLUSION_KEYWORD_LENGTH,
  normalizeExclusionText,
} from "./collection-exclusion";
import { PERSONAL_ALBAMON_SORT, canonicalPersonalAlbamonProfile } from "./personal-albamon-profile";

export const ALBAMON_PROFILE_SORT = PERSONAL_ALBAMON_SORT;

export interface AlbamonProfileImportPreview {
  keywords: string[];
  rawKeywordCount: number;
  emptyEntriesRemoved: number;
  duplicateEntriesRemoved: number;
  roundTripMatch: boolean;
  searchPeriodType: "ALL";
  sortType: typeof ALBAMON_PROFILE_SORT;
  areas: "I000,B000";
  excludeBar: true;
  ignoredPage: string | null;
}

export class AlbamonProfileImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function validatedUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new AlbamonProfileImportError("ALBAMON_PROFILE_URL_INVALID", "올바른 알바몬 검색 URL을 입력해주세요."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname.toLowerCase() !== "www.albamon.com" || url.pathname.replace(/\/$/u, "") !== "/jobs/total") {
    throw new AlbamonProfileImportError("ALBAMON_PROFILE_URL_NOT_ALLOWED", "https://www.albamon.com/jobs/total URL만 가져올 수 있습니다.");
  }
  return url;
}

export function encodeAlbamonExclusionKeywords(keywords: readonly string[]): string {
  const params = new URLSearchParams();
  params.set("excludeKeywords", keywords.join(","));
  return params.toString();
}

export function decodeAlbamonExclusionKeywords(encoded: string): string[] {
  return new URLSearchParams(encoded).get("excludeKeywords")?.split(",") ?? [];
}

export function parseAlbamonProfileUrl(value: string): AlbamonProfileImportPreview {
  const url = validatedUrl(value);
  const params = url.searchParams;
  if (params.get("searchPeriodType") !== "ALL" || params.get("sortType") !== ALBAMON_PROFILE_SORT
    || params.get("areas") !== "I000,B000" || params.get("excludeBar") !== "true") {
    throw new AlbamonProfileImportError("ALBAMON_PROFILE_CONTRACT_INVALID", "전체기간·서울/경기·제외 업종·월급순 검색 URL인지 확인해주세요.");
  }
  const decoded = params.get("excludeKeywords");
  if (decoded === null) throw new AlbamonProfileImportError("ALBAMON_PROFILE_EXCLUSIONS_MISSING", "URL에 제외 키워드가 없습니다.");
  const raw = decoded.split(",");
  const keywords: string[] = [];
  const seen = new Set<string>();
  let emptyEntriesRemoved = 0;
  let duplicateEntriesRemoved = 0;
  for (const item of raw) {
    const normalized = normalizeExclusionText(item);
    if (!normalized) { emptyEntriesRemoved += 1; continue; }
    if (normalized.length < MIN_EXCLUSION_KEYWORD_LENGTH || normalized.length > MAX_EXCLUSION_KEYWORD_LENGTH) {
      throw new AlbamonProfileImportError("ALBAMON_PROFILE_KEYWORD_INVALID", "허용 길이를 벗어난 제외 키워드가 있습니다.");
    }
    if (seen.has(normalized)) { duplicateEntriesRemoved += 1; continue; }
    seen.add(normalized); keywords.push(normalized);
  }
  if (!keywords.length || keywords.length > MAX_IMPORTED_EXCLUSION_KEYWORDS) {
    throw new AlbamonProfileImportError("ALBAMON_PROFILE_KEYWORD_LIMIT", `제외 키워드는 1~${MAX_IMPORTED_EXCLUSION_KEYWORDS}개여야 합니다.`);
  }
  const roundTrip = decodeAlbamonExclusionKeywords(encodeAlbamonExclusionKeywords(keywords)).map(normalizeExclusionText);
  return { keywords, rawKeywordCount: raw.length, emptyEntriesRemoved, duplicateEntriesRemoved,
    roundTripMatch: roundTrip.length === keywords.length && roundTrip.every((item, index) => item === keywords[index]),
    searchPeriodType: "ALL", sortType: ALBAMON_PROFILE_SORT, areas: "I000,B000", excludeBar: true,
    ignoredPage: params.get("page") };
}

export function canonicalAlbamonProfile(preview: Pick<AlbamonProfileImportPreview, "keywords" | "searchPeriodType" | "sortType" | "areas" | "excludeBar">): string {
  return canonicalPersonalAlbamonProfile({ areas: preview.areas, searchPeriodType: preview.searchPeriodType,
    sortType: preview.sortType, excludeBar: preview.excludeBar, exclusions: preview.keywords });
}
