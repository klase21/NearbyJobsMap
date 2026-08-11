import { normalizeImportedCollectionExclusionConfig } from "./collection-exclusion";

export const PERSONAL_ALBAMON_PROFILE_VERSION = 1 as const;
export const PERSONAL_ALBAMON_AREAS = "I000,B000" as const;
export const PERSONAL_ALBAMON_PERIOD = "ALL" as const;
export const PERSONAL_ALBAMON_SORT = "MONTHLY_SALARY" as const;
export const PERSONAL_ALBAMON_PAGE_SIZE = 50 as const;
export const PERSONAL_ALBAMON_MAX_PAGES = 150 as const;

export interface PersonalAlbamonProfileInput {
  areas: typeof PERSONAL_ALBAMON_AREAS;
  searchPeriodType: typeof PERSONAL_ALBAMON_PERIOD;
  sortType: typeof PERSONAL_ALBAMON_SORT;
  excludeBar: true;
  exclusions: string[];
}

export interface PersonalAlbamonProfileFile {
  version: typeof PERSONAL_ALBAMON_PROFILE_VERSION;
  albamon: PersonalAlbamonProfileInput;
  updatedAt: string;
}

export class PersonalAlbamonProfileError extends Error {
  readonly status = 400;
  constructor(public readonly code: string, message: string) { super(message); }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function normalizePersonalAlbamonProfile(value: unknown): PersonalAlbamonProfileInput {
  if (!isRecord(value) || value.areas !== PERSONAL_ALBAMON_AREAS || value.searchPeriodType !== PERSONAL_ALBAMON_PERIOD
    || value.sortType !== PERSONAL_ALBAMON_SORT || value.excludeBar !== true || !Array.isArray(value.exclusions)) {
    throw new PersonalAlbamonProfileError("PERSONAL_ALBAMON_PROFILE_INVALID", "알바몬 개인 검색 프로필 형식이 올바르지 않습니다.");
  }
  const exclusion = normalizeImportedCollectionExclusionConfig({ keywords: value.exclusions as string[], fields: ["title", "category"] });
  if (!exclusion.keywords.length) throw new PersonalAlbamonProfileError("PERSONAL_ALBAMON_PROFILE_EMPTY", "알바몬 개인 검색 프로필에 제외 키워드가 없습니다.");
  return { areas: PERSONAL_ALBAMON_AREAS, searchPeriodType: PERSONAL_ALBAMON_PERIOD,
    sortType: PERSONAL_ALBAMON_SORT, excludeBar: true, exclusions: exclusion.keywords };
}

export function canonicalPersonalAlbamonProfile(value: unknown): string {
  const profile = normalizePersonalAlbamonProfile(value);
  return JSON.stringify({ source: "albamon", searchPeriodType: profile.searchPeriodType, sortType: profile.sortType,
    areas: profile.areas, excludeKeywords: profile.exclusions, excludeBar: profile.excludeBar,
    pageSize: PERSONAL_ALBAMON_PAGE_SIZE, maxPages: PERSONAL_ALBAMON_MAX_PAGES });
}

export function parsePersonalAlbamonProfileFile(value: unknown): PersonalAlbamonProfileFile {
  if (!isRecord(value) || value.version !== PERSONAL_ALBAMON_PROFILE_VERSION || typeof value.updatedAt !== "string"
    || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new PersonalAlbamonProfileError("PERSONAL_ALBAMON_PROFILE_FILE_INVALID", "저장된 알바몬 개인 검색 프로필이 손상되었습니다.");
  }
  return { version: PERSONAL_ALBAMON_PROFILE_VERSION, albamon: normalizePersonalAlbamonProfile(value.albamon), updatedAt: value.updatedAt };
}
