import "server-only";
import { createHash } from "node:crypto";
import { normalizeProfileName, profileError, validateSavedProfileInput, type SavedCollectionProfileInput } from "../../services/saved-collection-profile";
import { savedProfileConfigurationHash } from "../../services/saved-collection-profile-hash.server";
import { PROFILE_EXPORT_FORMAT, PROFILE_EXPORT_VERSION, PROFILE_IMPORT_MAX_BYTES, PROFILE_TRANSFER_MAX_PROFILES, type ImportAction, type ImportPreviewProfile } from "./contracts";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";

const TOP_FIELDS = new Set(["format","version","exportedAt","application","profiles"]);
const PROFILE_FIELDS = new Set(["exportKey","name","source","basePresetId","strategy","keyword","regions","pages","maxCandidates","allowListingFallback","exclusionKeywords","exclusionFields","isFavorite","sourceRevision","sourceConfigurationHash"]);
const POLLUTION_KEYS = new Set(["__proto__","prototype","constructor"]);

function strictObject(value: unknown, fields: Set<string>, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileError(code, "가져오기 JSON 구조가 올바르지 않습니다.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => POLLUTION_KEYS.has(key) || !fields.has(key))) throw profileError(code, "허용되지 않은 가져오기 필드가 포함되어 있습니다.");
  return object;
}

function payloadHash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function inputOf(value: Record<string, unknown>): SavedCollectionProfileInput {
  return { name: value.name as string, source: value.source as SavedCollectionProfileInput["source"], basePresetId: value.basePresetId as string,
    strategy: value.strategy as SavedCollectionProfileInput["strategy"], keyword: value.keyword as string | null,
    regions: value.regions as SavedCollectionProfileInput["regions"], pages: value.pages as number, maxCandidates: value.maxCandidates as number,
    allowListingFallback: value.allowListingFallback as boolean,
    exclusion: { keywords: value.exclusionKeywords as string[], fields: value.exclusionFields as SavedCollectionProfileInput["exclusion"]["fields"] },
    isFavorite: value.isFavorite as boolean };
}

export function parseImportFile(bytes: Uint8Array): { profiles: Record<string, unknown>[]; payloadHash: string } {
  if (!bytes.byteLength) throw profileError("PROFILE_IMPORT_EMPTY", "빈 파일은 가져올 수 없습니다.");
  if (bytes.byteLength > PROFILE_IMPORT_MAX_BYTES) throw profileError("PROFILE_IMPORT_TOO_LARGE", "가져오기 파일은 512 KiB를 넘을 수 없습니다.", 413);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw profileError("PROFILE_IMPORT_JSON_INVALID", "UTF-8 JSON 파일을 읽을 수 없습니다."); }
  const root = strictObject(parsed, TOP_FIELDS, "PROFILE_IMPORT_SCHEMA_INVALID");
  if (root.format !== PROFILE_EXPORT_FORMAT) throw profileError("PROFILE_IMPORT_FORMAT_UNSUPPORTED", "지원하지 않는 프로필 파일 형식입니다.");
  if (root.version !== PROFILE_EXPORT_VERSION) throw profileError("PROFILE_IMPORT_VERSION_UNSUPPORTED", "지원하지 않는 프로필 파일 버전입니다.");
  if (root.application !== "NearbyJobsMap" || typeof root.exportedAt !== "string" || !Array.isArray(root.profiles)) throw profileError("PROFILE_IMPORT_SCHEMA_INVALID", "프로필 파일 메타데이터가 올바르지 않습니다.");
  if (root.profiles.length === 0) throw profileError("PROFILE_IMPORT_EMPTY", "가져올 프로필이 없습니다.");
  if (root.profiles.length > PROFILE_TRANSFER_MAX_PROFILES) throw profileError("PROFILE_IMPORT_TOO_MANY", "한 번에 최대 100개 프로필만 가져올 수 있습니다.");
  const profiles = root.profiles.map((item) => strictObject(item, PROFILE_FIELDS, "PROFILE_IMPORT_PROFILE_INVALID"));
  const keys = profiles.map((item) => item.exportKey);
  if (keys.some((key) => typeof key !== "string" || !key || key.length > 100) || new Set(keys).size !== keys.length) throw profileError("PROFILE_IMPORT_EXPORT_KEY_INVALID", "exportKey는 파일 안에서 고유한 문자열이어야 합니다.");
  return { profiles, payloadHash: payloadHash(bytes) };
}

export function previewImportedProfile(raw: Record<string, unknown>, index: number, existing: SavedCollectionProfile[]): ImportPreviewProfile {
  const exportKey = typeof raw.exportKey === "string" ? raw.exportKey : `invalid-${index}`;
  const importedName = typeof raw.name === "string" ? raw.name : "";
  let input: SavedCollectionProfileInput | null = null; let normalizedName: string | null = null; let hash: string | null = null;
  const errors: Array<{code:string;message:string}> = [];
  try {
    if (!Array.isArray(raw.regions) || !Array.isArray(raw.exclusionKeywords) || !Array.isArray(raw.exclusionFields) || typeof raw.isFavorite !== "boolean" || !Number.isInteger(raw.sourceRevision) || typeof raw.sourceConfigurationHash !== "string") throw profileError("PROFILE_IMPORT_PROFILE_INVALID", "프로필 필드 형식이 올바르지 않습니다.");
    input = validateSavedProfileInput(inputOf(raw)); normalizedName = normalizeProfileName(input.name).normalizedName;
    hash = savedProfileConfigurationHash({ source:input.source,basePresetId:input.basePresetId,strategy:input.strategy,keyword:input.keyword,regions:input.regions,pages:input.pages,maxCandidates:input.maxCandidates,allowListingFallback:input.allowListingFallback,exclusion:input.exclusion });
  } catch (error) { const value=error as {code?:string;message?:string}; errors.push({code:value.code??"PROFILE_IMPORT_PROFILE_INVALID",message:value.message??"프로필이 유효하지 않습니다."}); }
  const nameConflict = normalizedName ? existing.find((profile) => normalizeProfileName(profile.name).normalizedName === normalizedName) ?? null : null;
  const configConflict = hash ? existing.find((profile) => profile.configurationHash === hash) ?? null : null;
  let state: ImportPreviewProfile["state"] = "invalid";
  if (errors[0]?.code === "PROFILE_PRESET_INVALID") state = raw.source !== "jobkorea" && raw.source !== "albamon" ? "unsupported_source" : "unsupported_preset";
  else if (!errors.length && nameConflict && nameConflict.configurationHash === hash) state="identical_existing";
  else if (!errors.length && nameConflict) state="name_conflict_different_configuration";
  else if (!errors.length && configConflict) state="same_configuration_different_name";
  else if (!errors.length) state="valid_new";
  const replaceAllowed = Boolean(nameConflict && input && nameConflict.source===input.source && nameConflict.basePresetId===input.basePresetId && nameConflict.strategy===input.strategy);
  const availableActions: ImportAction[] = state === "valid_new" ? ["create","skip"] : state === "identical_existing" ? ["skip","rename_and_create","replace_existing"] : state === "name_conflict_different_configuration" ? ["skip","rename_and_create",...(replaceAllowed?["replace_existing" as const]:[])] : state === "same_configuration_different_name" ? ["skip","create","rename_and_create"] : [];
  return { importIndex:index,exportKey,importedName,normalizedName,source:typeof raw.source==="string"?raw.source:null,basePresetId:typeof raw.basePresetId==="string"?raw.basePresetId:null,
    configurationValid:!errors.length,validationErrors:errors,computedConfigurationHash:hash,exportedHashMatches:hash?raw.sourceConfigurationHash===hash:null,state,
    conflictingProfile:nameConflict?{id:nameConflict.id,name:nameConflict.name,revision:nameConflict.revision,configurationHash:nameConflict.configurationHash,source:nameConflict.source,basePresetId:nameConflict.basePresetId,strategy:nameConflict.strategy}:null,
    availableActions:[...availableActions],suggestedAction:state==="valid_new"?"create":state==="identical_existing"?"skip":state==="same_configuration_different_name"?"skip":state.startsWith("name_conflict")?"skip":null,configuration:input };
}
