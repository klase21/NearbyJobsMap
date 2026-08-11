import "server-only";
import { getPersonalAlbamonProfile, type PersonalAlbamonProfileState } from "../personal-albamon-profile/service";
import type { CollectionExclusionConfig } from "../../services/collection-exclusion";
import type { ManualBackfillConfig } from "./contracts";
import { validateBackfillConfig } from "./validation";

export interface BackfillConfigInput {
  source?: unknown;
  scope?: unknown;
  cutoffDate?: unknown;
  maxPages?: unknown;
  exclusion?: unknown;
}

export function resolveBackfillConfig(input: BackfillConfigInput,
  loadProfile: () => PersonalAlbamonProfileState = getPersonalAlbamonProfile): ManualBackfillConfig {
  if (input.source !== "albamon") return validateBackfillConfig(input);
  const state = loadProfile();
  if (!state.configured || !state.profile || !state.profileHash) {
    throw Object.assign(new Error("알바몬 개인 검색 프로필이 서버에 설정되지 않았습니다."),
      { code: "PERSONAL_ALBAMON_PROFILE_NOT_CONFIGURED", status: 409 });
  }
  const exclusion: CollectionExclusionConfig = { keywords: state.profile.albamon.exclusions, fields: ["title", "category"] };
  return validateBackfillConfig({ ...input, scope: "albamon_personal_all", cutoffDate: null,
    exclusion, personalProfileHash: state.profileHash });
}

export function formatPersonalBackfillProfilePreflight(config: ManualBackfillConfig): string {
  if (config.source !== "albamon" || !config.personalProfileHash) throw new Error("PERSONAL_ALBAMON_PROFILE_NOT_RESOLVED");
  return ["Profile: personal", "Areas: I000,B000", "Period: ALL", "Sort: MONTHLY_SALARY",
    `Exclusions: ${config.exclusion.keywords.length}`, `Profile hash: ${config.personalProfileHash}`].join("\n");
}
