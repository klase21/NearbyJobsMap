import { profileError, type SavedCollectionProfileInput } from "../../services/saved-collection-profile";

const PROFILE_FIELDS = new Set(["name","source","basePresetId","strategy","keyword","regions","pages","maxCandidates","allowListingFallback","exclusion","isFavorite"]);
const UPDATE_FIELDS = new Set([...PROFILE_FIELDS, "expectedRevision"]);

function object(value: unknown, allowed: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileError("PROFILE_REQUEST_INVALID", "프로필 요청 본문이 올바르지 않습니다.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.has(key))) throw profileError("PROFILE_REQUEST_FIELD_REJECTED", "허용되지 않은 프로필 필드가 포함되어 있습니다.");
  return record;
}
function input(record: Record<string, unknown>): SavedCollectionProfileInput {
  const exclusion = record.exclusion;
  if (!exclusion || typeof exclusion !== "object" || Array.isArray(exclusion) || Object.keys(exclusion).some((key) => key !== "keywords" && key !== "fields")) throw profileError("PROFILE_EXCLUSION_INVALID", "제외 설정이 올바르지 않습니다.");
  const x = exclusion as Record<string, unknown>;
  if (!Array.isArray(x.keywords) || !Array.isArray(x.fields) || !Array.isArray(record.regions)) throw profileError("PROFILE_REQUEST_INVALID", "지역과 제외 설정 배열이 필요합니다.");
  return { name: record.name as string, source: record.source as SavedCollectionProfileInput["source"], basePresetId: record.basePresetId as string,
    strategy: record.strategy as SavedCollectionProfileInput["strategy"], keyword: record.keyword as string | null, regions: record.regions as SavedCollectionProfileInput["regions"],
    pages: record.pages as number, maxCandidates: record.maxCandidates as number, allowListingFallback: record.allowListingFallback as boolean,
    exclusion: { keywords: x.keywords as string[], fields: x.fields as SavedCollectionProfileInput["exclusion"]["fields"] }, isFavorite: Boolean(record.isFavorite) };
}

export function parseProfileCreateBody(value: unknown): SavedCollectionProfileInput { return input(object(value, PROFILE_FIELDS)); }
export function parseProfileUpdateBody(value: unknown): { expectedRevision: number; profile: SavedCollectionProfileInput } {
  const record = object(value, UPDATE_FIELDS); if (!Number.isInteger(record.expectedRevision) || Number(record.expectedRevision) < 1) throw profileError("PROFILE_REVISION_INVALID", "현재 프로필 revision이 필요합니다.");
  return { expectedRevision: Number(record.expectedRevision), profile: input(record) };
}
export function parseFavoriteBody(value: unknown): { expectedRevision: number; isFavorite: boolean } {
  const record = object(value, new Set(["expectedRevision","isFavorite"]));
  if (!Number.isInteger(record.expectedRevision) || typeof record.isFavorite !== "boolean") throw profileError("PROFILE_REQUEST_INVALID", "즐겨찾기 상태와 revision이 필요합니다.");
  return { expectedRevision: Number(record.expectedRevision), isFavorite: record.isFavorite };
}
