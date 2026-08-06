import { normalizeCollectionExclusionConfig, type ExclusionField } from "../../../services/collection-exclusion";
import { buildJobKoreaKeywordSearchUrl, getJobKoreaCollectionPreset } from "../collection/jobkorea-collection-presets";
import { JobKoreaTransportError } from "../transport/jobkorea-error";
import type { JobKoreaBackfillOptions } from "./jobkorea-backfill-types";

export const JOBKOREA_BACKFILL_MAX_PAGE = 10;
export const JOBKOREA_BACKFILL_MAX_CANDIDATES = 200;
export const JOBKOREA_BACKFILL_CONFIRMATION = "BACKFILL JOBKOREA CAPITAL";

export function parseJobKoreaBackfillArgs(argv: string[]): JobKoreaBackfillOptions {
  const values = new Map<string, string | true>(); const repeated = new Map<string, string[]>();
  const valueFlags = new Set(["--preset", "--page-from", "--page-to", "--max-candidates", "--confirm-backfill", "--exclude-keyword", "--exclude-field"]);
  const booleanFlags = new Set(["--listing-only", "--dry-run", "--write", "--confirm"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (booleanFlags.has(key)) { values.set(key, true); continue; }
    if (!valueFlags.has(key)) throw new JobKoreaTransportError("JOBKOREA_BACKFILL_ARGUMENT_INVALID", `지원하지 않는 인자입니다: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new JobKoreaTransportError("JOBKOREA_BACKFILL_ARGUMENT_INVALID", `${key} 값이 필요합니다.`);
    if (key === "--exclude-keyword" || key === "--exclude-field") repeated.set(key, [...(repeated.get(key) ?? []), value]);
    else values.set(key, value);
    index += 1;
  }
  if (values.get("--preset") !== "capital-ai") throw new JobKoreaTransportError("JOBKOREA_BACKFILL_PRESET_INVALID", "capital-ai preset만 허용합니다.");
  if (!values.has("--listing-only")) throw new JobKoreaTransportError("JOBKOREA_BACKFILL_LISTING_ONLY_REQUIRED", "--listing-only가 필요합니다.");
  const pageFrom = Number(values.get("--page-from")); const pageTo = Number(values.get("--page-to"));
  const maxCandidates = Number(values.get("--max-candidates"));
  if (!Number.isInteger(pageFrom) || !Number.isInteger(pageTo) || pageFrom < 1 || pageTo < pageFrom || pageTo > JOBKOREA_BACKFILL_MAX_PAGE) {
    throw new JobKoreaTransportError("JOBKOREA_BACKFILL_PAGE_RANGE_INVALID", "page 범위는 1~10의 오름차순 정수여야 합니다.");
  }
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > JOBKOREA_BACKFILL_MAX_CANDIDATES) {
    throw new JobKoreaTransportError("JOBKOREA_BACKFILL_CANDIDATE_LIMIT_INVALID", "max-candidates는 1~200 정수여야 합니다.");
  }
  const dryRun = values.has("--dry-run"); const write = values.has("--write");
  if (dryRun === write) throw new JobKoreaTransportError("JOBKOREA_BACKFILL_MODE_REQUIRED", "--dry-run 또는 --write 중 하나가 필요합니다.");
  if (dryRun && !values.has("--confirm")) throw new JobKoreaTransportError("JOBKOREA_BACKFILL_CONFIRMATION_REQUIRED", "dry-run에는 --confirm이 필요합니다.");
  if (write && values.get("--confirm-backfill") !== JOBKOREA_BACKFILL_CONFIRMATION) {
    throw new JobKoreaTransportError("JOBKOREA_BACKFILL_CONFIRMATION_REQUIRED", `write에는 정확한 확인 문구가 필요합니다: ${JOBKOREA_BACKFILL_CONFIRMATION}`);
  }
  if (!(repeated.get("--exclude-keyword")?.length) && repeated.get("--exclude-field")?.length) {
    throw new JobKoreaTransportError("JOBKOREA_BACKFILL_EXCLUSION_INVALID", "exclude-field는 exclude-keyword와 함께 사용해야 합니다.");
  }
  const preset = getJobKoreaCollectionPreset("capital-ai")!;
  return { presetId: "capital-ai", presetLabel: preset.label, keyword: preset.keyword, searchUrl: buildJobKoreaKeywordSearchUrl(preset.keyword),
    pageFrom, pageTo, maxCandidates, listingOnly: true, mode: write ? "write" : "dry-run",
    exclusion: normalizeCollectionExclusionConfig({ keywords: repeated.get("--exclude-keyword") ?? [], fields: (repeated.get("--exclude-field") ?? []) as ExclusionField[] }) };
}
