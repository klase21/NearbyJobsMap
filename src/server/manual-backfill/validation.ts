import { koreaCalendarDate } from "../../services/collection-date";
import { normalizeCollectionExclusionConfig, normalizeImportedCollectionExclusionConfig, type CollectionExclusionConfig } from "../../services/collection-exclusion";
import type { ManualBackfillConfig, ManualBackfillScope, ManualBackfillSource } from "./contracts";

export class ManualBackfillValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const daysBefore = (date: string, days: number) => koreaCalendarDate(new Date(Date.parse(`${date}T00:00:00+09:00`) - days * 86_400_000));
export const MANUAL_BACKFILL_DEFAULT_MAX_PAGES = 100;
export const ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES = 150;
export const MANUAL_BACKFILL_USER_MAX_PAGES = 300;
export const MANUAL_BACKFILL_HARD_MAX_PAGES = 500;
export const MANUAL_BACKFILL_PAGE_OPTIONS = [50, 100, 150, 200, 300] as const;

export function validateBackfillInternalPageLimit(value: unknown): number {
  const maxPages = Number(value);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MANUAL_BACKFILL_HARD_MAX_PAGES) {
    throw new ManualBackfillValidationError("BACKFILL_INTERNAL_PAGES_INVALID", `내부 백필 페이지 한도는 1~${MANUAL_BACKFILL_HARD_MAX_PAGES}입니다.`);
  }
  return maxPages;
}

export function resolveBackfillCutoff(input: { days?: unknown; since?: unknown }, now = new Date()): string {
  const today = koreaCalendarDate(now);
  if (typeof input.since === "string" && input.since) {
    if (!DATE.test(input.since) || Number.isNaN(Date.parse(`${input.since}T00:00:00+09:00`)) || input.since > today)
      throw new ManualBackfillValidationError("BACKFILL_CUTOFF_INVALID", "과거 또는 오늘 날짜를 선택해주세요.");
    return input.since;
  }
  const days = Number(input.days ?? 7);
  if (![3, 7, 14, 30].includes(days)) throw new ManualBackfillValidationError("BACKFILL_DAYS_INVALID", "지원하는 기간을 선택해주세요.");
  return daysBefore(today, days - 1);
}

export function validateBackfillConfig(value: { source?: unknown; scope?: unknown; cutoffDate?: unknown; maxPages?: unknown; exclusion?: unknown; personalProfileHash?: unknown }): ManualBackfillConfig {
  const source = value.source as ManualBackfillSource;
  if (source !== "albamon" && source !== "jobkorea") throw new ManualBackfillValidationError("BACKFILL_SOURCE_INVALID", "지원하지 않는 소스입니다.");
  const scope = (value.scope ?? (source === "albamon" ? "albamon_personal_all" : "date_cutoff")) as ManualBackfillScope;
  if (source === "albamon" && scope !== "albamon_personal_all" || source === "jobkorea" && scope !== "date_cutoff")
    throw new ManualBackfillValidationError("BACKFILL_SCOPE_INVALID", "소스와 백필 범위가 일치하지 않습니다.");
  const cutoffDate = scope === "date_cutoff" ? value.cutoffDate : null;
  if (scope === "date_cutoff" && (typeof cutoffDate !== "string" || !DATE.test(cutoffDate))) throw new ManualBackfillValidationError("BACKFILL_CUTOFF_INVALID", "백필 기준 날짜가 올바르지 않습니다.");
  const defaultPages = scope === "albamon_personal_all" ? ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES : MANUAL_BACKFILL_DEFAULT_MAX_PAGES;
  const maxPages = value.maxPages === undefined ? defaultPages : Number(value.maxPages);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MANUAL_BACKFILL_USER_MAX_PAGES) {
    throw new ManualBackfillValidationError("BACKFILL_PAGES_INVALID", `사용자 백필 최대 페이지는 1~${MANUAL_BACKFILL_USER_MAX_PAGES}입니다.`);
  }
  validateBackfillInternalPageLimit(maxPages);
  if (value.exclusion !== undefined && value.exclusion !== null && (typeof value.exclusion !== "object" || Array.isArray(value.exclusion))) {
    throw new ManualBackfillValidationError("BACKFILL_EXCLUSION_INVALID", "제외 키워드 설정이 올바르지 않습니다.");
  }
  const personalProfileHash = scope === "albamon_personal_all" && typeof value.personalProfileHash === "string" ? value.personalProfileHash : null;
  return { source, scope, cutoffDate: cutoffDate as string | null, maxPages, personalProfileHash,
    exclusion: (scope === "albamon_personal_all" ? normalizeImportedCollectionExclusionConfig : normalizeCollectionExclusionConfig)(value.exclusion as Partial<CollectionExclusionConfig> | null | undefined) };
}
