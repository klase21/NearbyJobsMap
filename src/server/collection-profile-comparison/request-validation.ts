import { PROFILE_ID_PATTERN } from "../collection-profiles/repository";
import type { ProfileComparisonPeriod, ProfileComparisonRequest, ProfileComparisonRevisionScope } from "./contracts";

const PERIODS = new Set<ProfileComparisonPeriod>(["7d", "30d", "all"]);
const SCOPES = new Set<ProfileComparisonRevisionScope>(["current", "all"]);

export function parseProfileComparisonRequest(value: unknown): ProfileComparisonRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("요청 본문");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["profileIds", "period", "revisionScope"].includes(key))) throw invalid("허용되지 않은 필드");
  if (!Array.isArray(record.profileIds) || record.profileIds.length < 2 || record.profileIds.length > 4 || record.profileIds.some((id) => typeof id !== "string" || !PROFILE_ID_PATTERN.test(id))) throw invalid("프로필 선택");
  if (new Set(record.profileIds).size !== record.profileIds.length) throw Object.assign(new Error("같은 프로필을 중복 선택할 수 없습니다."), { code: "PROFILE_COMPARISON_DUPLICATE_ID", status: 409 });
  if (!PERIODS.has(record.period as ProfileComparisonPeriod)) throw invalid("기간");
  if (!SCOPES.has(record.revisionScope as ProfileComparisonRevisionScope)) throw invalid("리비전 범위");
  return { profileIds: record.profileIds as string[], period: record.period as ProfileComparisonPeriod, revisionScope: record.revisionScope as ProfileComparisonRevisionScope };
}

function invalid(field: string): Error {
  return Object.assign(new Error(`프로필 비교 ${field}이 올바르지 않습니다.`), { code: "PROFILE_COMPARISON_REQUEST_INVALID", status: 400 });
}
