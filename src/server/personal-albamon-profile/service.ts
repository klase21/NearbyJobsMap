import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PERSONAL_ALBAMON_PROFILE_VERSION,
  canonicalPersonalAlbamonProfile,
  normalizePersonalAlbamonProfile,
  parsePersonalAlbamonProfileFile,
  type PersonalAlbamonProfileFile,
  type PersonalAlbamonProfileInput,
} from "../../services/personal-albamon-profile";

export const PERSONAL_ALBAMON_PROFILE_PATH = resolve("data/private/personal-search-profile.json");
const PERSONAL_ALBAMON_PROFILE_MAX_BYTES = 128 * 1024;

export interface PersonalAlbamonProfileState {
  configured: boolean;
  profile: PersonalAlbamonProfileFile | null;
  profileHash: string | null;
}

export function computePersonalAlbamonProfileHash(value: unknown): string {
  return createHash("sha256").update(canonicalPersonalAlbamonProfile(value), "utf8").digest("hex").toUpperCase();
}

export function getPersonalAlbamonProfile(filePath = PERSONAL_ALBAMON_PROFILE_PATH): PersonalAlbamonProfileState {
  if (!existsSync(filePath)) return { configured: false, profile: null, profileHash: null };
  if (statSync(filePath).size > PERSONAL_ALBAMON_PROFILE_MAX_BYTES) {
    throw Object.assign(new Error("저장된 알바몬 개인 검색 프로필이 허용 크기를 초과했습니다."),
      { code: "PERSONAL_ALBAMON_PROFILE_FILE_TOO_LARGE", status: 500 });
  }
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(filePath, "utf8")); }
  catch { throw Object.assign(new Error("저장된 알바몬 개인 검색 프로필을 읽을 수 없습니다."), { code: "PERSONAL_ALBAMON_PROFILE_FILE_INVALID", status: 500 }); }
  let profile: PersonalAlbamonProfileFile;
  try { profile = parsePersonalAlbamonProfileFile(raw); }
  catch (error) {
    throw Object.assign(new Error("저장된 알바몬 개인 검색 프로필이 손상되었습니다."),
      { code: "PERSONAL_ALBAMON_PROFILE_FILE_INVALID", status: 500, cause: error });
  }
  return { configured: true, profile, profileHash: computePersonalAlbamonProfileHash(profile.albamon) };
}

export function savePersonalAlbamonProfile(value: unknown, options: { filePath?: string; now?: Date } = {}): PersonalAlbamonProfileState {
  const albamon = normalizePersonalAlbamonProfile(value);
  const profile: PersonalAlbamonProfileFile = { version: PERSONAL_ALBAMON_PROFILE_VERSION, albamon,
    updatedAt: (options.now ?? new Date()).toISOString() };
  const filePath = options.filePath ?? PERSONAL_ALBAMON_PROFILE_PATH;
  const directory = dirname(filePath); mkdirSync(directory, { recursive: true });
  const temporaryPath = resolve(directory, `.personal-search-profile.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor); closeSync(descriptor); descriptor = null;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return getPersonalAlbamonProfile(filePath);
}

export function profileInputFromImportedUrl(value: Pick<PersonalAlbamonProfileInput, "areas" | "searchPeriodType" | "sortType" | "excludeBar"> & { keywords: string[] }): PersonalAlbamonProfileInput {
  return normalizePersonalAlbamonProfile({ areas: value.areas, searchPeriodType: value.searchPeriodType,
    sortType: value.sortType, excludeBar: value.excludeBar, exclusions: value.keywords });
}
