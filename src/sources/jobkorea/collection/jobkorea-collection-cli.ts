import { JobKoreaTransportError } from "../transport/jobkorea-error";
import { normalizeJobKoreaSearchUrl } from "../transport/jobkorea-url-policy";
import type { JobKoreaCollectionOptions } from "./jobkorea-collection-types";
import type { CollectionRegion } from "../../../services/region-normalizer";
import { buildJobKoreaKeywordSearchUrl, getJobKoreaCollectionPreset } from "./jobkorea-collection-presets";

export const JOBKOREA_COLLECTION_MAX_PAGES = 5;
export const JOBKOREA_COLLECTION_MAX_DETAILS = 50;

function regions(value: string | true | undefined): CollectionRegion[] {
  if (value === undefined) return [];
  if (value === "seoul") return ["seoul"];
  if (value === "gyeonggi") return ["gyeonggi"];
  if (value === "capital") return ["seoul", "gyeonggi"];
  throw new JobKoreaTransportError("JOBKOREA_COLLECTION_REGION_INVALID", "--region은 seoul, gyeonggi, capital 중 하나여야 합니다.");
}

export function parseJobKoreaCollectionArgs(argv: string[]): JobKoreaCollectionOptions {
  const values = new Map<string, string | true>();
  const valueFlags = new Set(["--preset", "--search-url", "--pages", "--max-details", "--region"]);
  const booleanFlags = new Set(["--confirm", "--dry-run", "--write", "--allow-listing-fallback"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (booleanFlags.has(key)) { values.set(key, true); continue; }
    if (!valueFlags.has(key)) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_ARGUMENT_INVALID", `지원하지 않는 인자입니다: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_ARGUMENT_INVALID", `${key} 값이 필요합니다.`);
    values.set(key, value); index += 1;
  }
  if (!values.has("--confirm")) throw new JobKoreaTransportError("JOBKOREA_CONFIRMATION_REQUIRED", "실행하려면 --confirm이 필요합니다.");
  const presetValue = values.get("--preset"); const candidate = values.get("--search-url");
  if (presetValue && candidate) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_SOURCE_CONFLICT", "--preset과 --search-url은 함께 사용할 수 없습니다.");
  const preset = typeof presetValue === "string" ? getJobKoreaCollectionPreset(presetValue) : null;
  if (typeof presetValue === "string" && !preset) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_PRESET_UNKNOWN", `알 수 없는 preset입니다: ${presetValue}`);
  if (!preset && typeof candidate !== "string") throw new JobKoreaTransportError("JOBKOREA_SEARCH_URL_REQUIRED", "--preset 또는 --search-url이 필요합니다.");
  const pagesValue = values.get("--pages"); const maxDetailsValue = values.get("--max-details");
  if (!preset && (typeof pagesValue !== "string" || typeof maxDetailsValue !== "string")) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_ARGUMENT_INVALID", "명시 URL에는 --pages와 --max-details가 필요합니다.");
  const pages = pagesValue === undefined ? preset!.pages : Number(pagesValue);
  const maxDetails = maxDetailsValue === undefined ? preset!.maxDetails : Number(maxDetailsValue);
  if (!Number.isInteger(pages) || pages < 1 || pages > JOBKOREA_COLLECTION_MAX_PAGES) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_PAGES_INVALID", "--pages는 1~5 정수여야 합니다.");
  if (!Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > JOBKOREA_COLLECTION_MAX_DETAILS) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_MAX_DETAILS_INVALID", "--max-details는 1~50 정수여야 합니다.");
  if (preset && (pages > preset.pages || maxDetails > preset.maxDetails)) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_PRESET_LIMIT_EXCEEDED", "명시 옵션은 preset 한도를 줄일 수만 있습니다.");
  const requestedRegions = values.has("--region") ? regions(values.get("--region")) : preset?.regions ?? [];
  if (preset && requestedRegions.some((region) => !preset.regions.includes(region))) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_PRESET_REGION_EXCEEDED", "--region은 preset 지역 범위를 넓힐 수 없습니다.");
  const dryRun = values.has("--dry-run"); const write = values.has("--write");
  if (dryRun === write) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_MODE_REQUIRED", "--dry-run 또는 --write 중 정확히 하나가 필요합니다.");
  const searchUrl = preset ? buildJobKoreaKeywordSearchUrl(preset.keyword) : normalizeJobKoreaSearchUrl(candidate as string);
  const keyword = preset?.keyword ?? new URL(searchUrl).searchParams.get("stext")?.trim() ?? "";
  return { searchUrl, pages: pages as 1 | 2 | 3 | 4 | 5, maxDetails, mode: write ? "write" : "dry-run", confirm: true,
    allowListingFallback: preset?.allowListingFallback || values.has("--allow-listing-fallback"), presetId: preset?.id ?? null,
    presetLabel: preset?.label ?? null, keyword, requestedRegions };
}
