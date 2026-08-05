import { JobKoreaTransportError } from "../transport/jobkorea-error";
import { normalizeJobKoreaSearchUrl } from "../transport/jobkorea-url-policy";
import type { JobKoreaCollectionOptions } from "./jobkorea-collection-types";

export function parseJobKoreaCollectionArgs(argv: string[]): JobKoreaCollectionOptions {
  const values = new Map<string, string | true>();
  const valueFlags = new Set(["--search-url", "--pages", "--max-details"]);
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
  const candidate = values.get("--search-url");
  if (typeof candidate !== "string") throw new JobKoreaTransportError("JOBKOREA_SEARCH_URL_REQUIRED", "--search-url이 필요합니다.");
  const pages = Number(values.get("--pages"));
  if (!Number.isInteger(pages) || pages < 1 || pages > 3) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_PAGES_INVALID", "--pages는 1, 2, 3 중 하나여야 합니다.");
  const maxDetails = Number(values.get("--max-details"));
  if (!Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > 30) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_MAX_DETAILS_INVALID", "--max-details는 1~30 정수여야 합니다.");
  const dryRun = values.has("--dry-run"); const write = values.has("--write");
  if (dryRun === write) throw new JobKoreaTransportError("JOBKOREA_COLLECTION_MODE_REQUIRED", "--dry-run 또는 --write 중 정확히 하나가 필요합니다.");
  return { searchUrl: normalizeJobKoreaSearchUrl(candidate), pages: pages as 1 | 2 | 3, maxDetails, mode: write ? "write" : "dry-run", confirm: true,
    allowListingFallback: values.has("--allow-listing-fallback") };
}
