import "server-only";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { normalizeProfileName, profileError, validateSavedProfileInput, type SavedCollectionProfile, type SavedCollectionProfileInput } from "../../services/saved-collection-profile";
import { savedProfileConfigurationHash } from "../../services/saved-collection-profile-hash.server";
import type { CollectionRegion } from "../../services/region-normalizer";
import type { ExclusionField } from "../../services/collection-exclusion";

type Row = Record<string, unknown>;
export const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function array<T extends string>(value: unknown, allowed?: readonly T[]): T[] {
  if (typeof value !== "string") return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is T => typeof item === "string" && (!allowed || allowed.includes(item as T))) : []; }
  catch { return []; }
}

function mapProfile(row: Row): SavedCollectionProfile {
  return { id: String(row.id), name: String(row.name), source: row.source === "albamon" ? "albamon" : "jobkorea", basePresetId: String(row.base_preset_id),
    strategy: row.strategy === "albamon_today" ? "albamon_today" : "jobkorea_keyword", keyword: typeof row.keyword === "string" ? row.keyword : null,
    regions: array<CollectionRegion>(row.requested_regions_json, ["seoul", "gyeonggi"]), pages: Number(row.pages), maxCandidates: Number(row.max_candidates),
    allowListingFallback: Number(row.allow_listing_fallback) === 1,
    exclusion: { keywords: array<string>(row.exclusion_keywords_json), fields: array<ExclusionField>(row.exclusion_fields_json, ["title", "company", "location", "category", "employment_type", "work_schedule"]) },
    isFavorite: Number(row.is_favorite) === 1, revision: Number(row.revision), configurationHash: String(row.configuration_hash), createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null };
}

function configurationHash(input: SavedCollectionProfileInput): string {
  return savedProfileConfigurationHash({ source: input.source, basePresetId: input.basePresetId, strategy: input.strategy, keyword: input.keyword,
    regions: input.regions, pages: input.pages, maxCandidates: input.maxCandidates, allowListingFallback: input.allowListingFallback, exclusion: input.exclusion });
}

function constraint(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")) throw profileError("PROFILE_NAME_CONFLICT", "같은 이름의 저장 프로필이 이미 있습니다.", 409);
  throw error;
}

export class SavedCollectionProfileRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date = () => new Date()) {}

  count(): number { return Number((this.database.prepare("SELECT COUNT(*) count FROM saved_collection_profiles").get() as Row).count); }
  list(): SavedCollectionProfile[] { return (this.database.prepare(`SELECT * FROM saved_collection_profiles ORDER BY is_favorite DESC,
    CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END, last_used_at DESC, updated_at DESC, normalized_name`).all() as Row[]).map(mapProfile); }
  get(id: string): SavedCollectionProfile | null { if (!PROFILE_ID_PATTERN.test(id)) return null; const row = this.database.prepare("SELECT * FROM saved_collection_profiles WHERE id=?").get(id) as Row | undefined; return row ? mapProfile(row) : null; }

  create(raw: SavedCollectionProfileInput): SavedCollectionProfile {
    const input = validateSavedProfileInput(raw); const id = randomUUID(); const now = this.now().toISOString(); const normalizedName = normalizeProfileName(input.name).normalizedName;
    try { this.database.prepare(`INSERT INTO saved_collection_profiles
      (id,name,normalized_name,source,base_preset_id,strategy,keyword,requested_regions_json,pages,max_candidates,allow_listing_fallback,
       exclusion_keywords_json,exclusion_fields_json,is_favorite,revision,configuration_hash,created_at,updated_at,last_used_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,NULL)`).run(id, input.name, normalizedName, input.source, input.basePresetId, input.strategy, input.keyword,
        JSON.stringify(input.regions), input.pages, input.maxCandidates, input.allowListingFallback ? 1 : 0, JSON.stringify(input.exclusion.keywords),
        JSON.stringify(input.exclusion.fields), input.isFavorite ? 1 : 0, configurationHash(input), now, now); }
    catch (error) { constraint(error); }
    return this.get(id)!;
  }

  update(id: string, expectedRevision: number, raw: SavedCollectionProfileInput): SavedCollectionProfile {
    const current = this.require(id); if (current.revision !== expectedRevision) throw profileError("PROFILE_REVISION_CONFLICT", "다른 화면에서 프로필이 변경되었습니다. 새로고침 후 다시 시도하세요.", 409);
    const input = validateSavedProfileInput(raw);
    if (input.source !== current.source || input.basePresetId !== current.basePresetId || input.strategy !== current.strategy) throw profileError("PROFILE_IDENTITY_IMMUTABLE", "프로필의 소스와 기본 프리셋은 변경할 수 없습니다.");
    const now = this.now().toISOString(); const normalizedName = normalizeProfileName(input.name).normalizedName;
    try { const changed = this.database.prepare(`UPDATE saved_collection_profiles SET name=?, normalized_name=?, keyword=?, requested_regions_json=?, pages=?, max_candidates=?,
      allow_listing_fallback=?, exclusion_keywords_json=?, exclusion_fields_json=?, revision=revision+1, configuration_hash=?, updated_at=? WHERE id=? AND revision=?`).run(
      input.name, normalizedName, input.keyword, JSON.stringify(input.regions), input.pages, input.maxCandidates, input.allowListingFallback ? 1 : 0,
      JSON.stringify(input.exclusion.keywords), JSON.stringify(input.exclusion.fields), configurationHash(input), now, id, expectedRevision);
      if (changed.changes !== 1) throw profileError("PROFILE_REVISION_CONFLICT", "다른 화면에서 프로필이 변경되었습니다. 새로고침 후 다시 시도하세요.", 409); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "PROFILE_REVISION_CONFLICT") throw error; constraint(error); }
    return this.get(id)!;
  }

  setFavorite(id: string, expectedRevision: number, favorite: boolean): SavedCollectionProfile {
    const current = this.require(id); if (current.revision !== expectedRevision) throw profileError("PROFILE_REVISION_CONFLICT", "다른 화면에서 프로필이 변경되었습니다. 새로고침 후 다시 시도하세요.", 409);
    this.database.prepare("UPDATE saved_collection_profiles SET is_favorite=?, updated_at=? WHERE id=?").run(favorite ? 1 : 0, this.now().toISOString(), id);
    return this.get(id)!;
  }

  duplicate(id: string): SavedCollectionProfile {
    const current = this.require(id); const base = `${current.name} 복사본`; let name = base; let suffix = 2;
    while (this.database.prepare("SELECT 1 FROM saved_collection_profiles WHERE normalized_name=?").get(normalizeProfileName(name).normalizedName)) name = `${base} ${suffix++}`;
    return this.create({ name, source: current.source, basePresetId: current.basePresetId, strategy: current.strategy, keyword: current.keyword, regions: current.regions,
      pages: current.pages, maxCandidates: current.maxCandidates, allowListingFallback: current.allowListingFallback, exclusion: current.exclusion, isFavorite: false });
  }

  delete(id: string): void { this.require(id); this.database.prepare("DELETE FROM saved_collection_profiles WHERE id=?").run(id); }
  markLastUsed(id: string): void { this.require(id); this.database.prepare("UPDATE saved_collection_profiles SET last_used_at=? WHERE id=?").run(this.now().toISOString(), id); }
  require(id: string): SavedCollectionProfile { const profile = this.get(id); if (!profile) throw profileError("PROFILE_NOT_FOUND", "저장 프로필을 찾을 수 없습니다.", 404); return profile; }
}
