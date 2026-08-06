import type { CollectionRegion } from "./region-normalizer";
import { canonicalizeExclusionConfig, normalizeCollectionExclusionConfig, type CollectionExclusionConfig } from "./collection-exclusion";
import { COLLECTION_PRESETS, getCollectionPreset } from "../sources/collection/collection-presets";

export type SavedProfileSource = "jobkorea" | "albamon";
export type SavedProfileStrategy = "jobkorea_keyword" | "albamon_today";

export interface SavedCollectionProfile {
  id: string;
  name: string;
  source: SavedProfileSource;
  basePresetId: string;
  strategy: SavedProfileStrategy;
  keyword: string | null;
  regions: CollectionRegion[];
  pages: number;
  maxCandidates: number;
  allowListingFallback: boolean;
  exclusion: CollectionExclusionConfig;
  isFavorite: boolean;
  revision: number;
  configurationHash: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface SavedCollectionProfileInput {
  name: string;
  source: SavedProfileSource;
  basePresetId: string;
  strategy: SavedProfileStrategy;
  keyword: string | null;
  regions: CollectionRegion[];
  pages: number;
  maxCandidates: number;
  allowListingFallback: boolean;
  exclusion: CollectionExclusionConfig;
  isFavorite?: boolean;
}

const SPACE = /\s+/gu;
const REGION_ORDER: CollectionRegion[] = ["seoul", "gyeonggi"];

export function normalizeProfileName(value: unknown): { name: string; normalizedName: string } {
  if (typeof value !== "string") throw profileError("PROFILE_NAME_INVALID", "프로필 이름이 필요합니다.");
  const name = value.normalize("NFKC").trim().replace(SPACE, " ");
  if (hasControlCharacter(name) || name.length < 2 || name.length > 60) throw profileError("PROFILE_NAME_INVALID", "프로필 이름은 제어 문자 없이 2~60자여야 합니다.");
  if (Object.values(COLLECTION_PRESETS).some((preset) => preset.label.normalize("NFKC").toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))) throw profileError("PROFILE_NAME_RESERVED", "기본 프리셋 이름과 같은 이름은 사용할 수 없습니다.");
  return { name, normalizedName: name.toLocaleLowerCase("en-US") };
}

export function normalizeProfileKeyword(value: unknown): string {
  if (typeof value !== "string") throw profileError("PROFILE_KEYWORD_INVALID", "잡코리아 키워드가 필요합니다.");
  const keyword = value.normalize("NFKC").trim().replace(SPACE, " ");
  if (hasControlCharacter(keyword) || keyword.length < 2 || keyword.length > 50 || /:\/\//u.test(keyword)) {
    throw profileError("PROFILE_KEYWORD_INVALID", "키워드는 URL이나 제어 문자가 아닌 2~50자 텍스트여야 합니다.");
  }
  return keyword;
}

export function validateSavedProfileInput(input: SavedCollectionProfileInput): SavedCollectionProfileInput & { name: string; regions: CollectionRegion[] } {
  const { name } = normalizeProfileName(input.name);
  const preset = getCollectionPreset(input.basePresetId);
  if (!preset || (input.source !== "jobkorea" && input.source !== "albamon") || preset.source !== input.source) throw profileError("PROFILE_PRESET_INVALID", "소스와 기본 프리셋이 일치하지 않습니다.");
  const expectedStrategy: SavedProfileStrategy = input.source === "jobkorea" ? "jobkorea_keyword" : "albamon_today";
  if (input.strategy !== expectedStrategy) throw profileError("PROFILE_STRATEGY_INVALID", "소스에 허용되지 않은 수집 방식입니다.");
  const regions = REGION_ORDER.filter((region) => Array.isArray(input.regions) && input.regions.includes(region));
  if (!Array.isArray(input.regions) || regions.length === 0 || input.regions.length !== new Set(input.regions).size || input.regions.some((region) => !REGION_ORDER.includes(region))) throw profileError("PROFILE_REGIONS_INVALID", "서울 또는 경기 지역을 하나 이상 선택해야 합니다.");
  if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > preset.pages || input.pages > 5) throw profileError("PROFILE_PAGES_INVALID", "페이지 수가 기본 프리셋 한도를 벗어났습니다.");
  if (!Number.isInteger(input.maxCandidates) || input.maxCandidates < 1 || input.maxCandidates > preset.maxDetails || input.maxCandidates > 50) throw profileError("PROFILE_MAX_CANDIDATES_INVALID", "후보 수가 기본 프리셋 한도를 벗어났습니다.");
  const presetFallback = preset.source === "jobkorea" ? preset.allowListingFallback : false;
  if (input.allowListingFallback !== presetFallback) throw profileError("PROFILE_FALLBACK_INVALID", "목록 정보 대체 정책은 기본 프리셋과 같아야 합니다.");
  const keyword = input.source === "jobkorea" ? normalizeProfileKeyword(input.keyword) : null;
  if (input.source === "albamon" && input.keyword !== null) throw profileError("PROFILE_KEYWORD_INVALID", "알바몬 오늘 등록 프로필은 키워드를 받지 않습니다.");
  return { ...input, name, keyword, regions, exclusion: normalizeCollectionExclusionConfig(input.exclusion), isFavorite: Boolean(input.isFavorite) };
}

export function canonicalProfileConfiguration(input: Omit<SavedCollectionProfileInput, "name" | "isFavorite">): string {
  const normalized = validateSavedProfileInput({ ...input, name: "해시 구성", isFavorite: false });
  return JSON.stringify({ source: normalized.source, basePresetId: normalized.basePresetId, strategy: normalized.strategy, keyword: normalized.keyword,
    regions: normalized.regions, pages: normalized.pages, maxCandidates: normalized.maxCandidates, allowListingFallback: normalized.allowListingFallback,
    exclusion: JSON.parse(canonicalizeExclusionConfig(normalized.exclusion)) });
}

export function profileDifferenceSummary(profile: Pick<SavedCollectionProfile, "basePresetId" | "pages" | "maxCandidates" | "keyword" | "regions" | "exclusion">): string[] {
  const preset = getCollectionPreset(profile.basePresetId); if (!preset) return [];
  const result: string[] = [];
  if (profile.pages !== preset.pages) result.push(`페이지 ${preset.pages}→${profile.pages}`);
  if (profile.maxCandidates !== preset.maxDetails) result.push(`후보 ${preset.maxDetails}→${profile.maxCandidates}`);
  if (preset.source === "jobkorea" && profile.keyword !== preset.keyword) result.push(`키워드 ${profile.keyword}`);
  if (profile.regions.join(",") !== preset.regions.join(",")) result.push(`지역 ${profile.regions.map((r) => r === "seoul" ? "서울" : "경기").join("+")}`);
  if (profile.exclusion.keywords.length) result.push(`제외 ${profile.exclusion.keywords.length}개`);
  return result;
}

export function profileError(code: string, message: string, status = 400): Error {
  return Object.assign(new Error(message), { code, status });
}

function hasControlCharacter(value: string): boolean { return [...value].some((character) => { const code = character.codePointAt(0) ?? 0; return code < 32 || code === 127; }); }
