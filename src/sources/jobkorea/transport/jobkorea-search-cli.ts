import { JobKoreaTransportError } from "./jobkorea-error";
import type { JobKoreaSearchOptions, JobKoreaSearchTransportChoice } from "./jobkorea-search-types";
import { normalizeJobKoreaSearchUrl } from "./jobkorea-url-policy";

export function parseJobKoreaSearchCliArgs(argv: string[]): JobKoreaSearchOptions {
  const values = new Map<string, string | true>();
  const valueFlags = new Set(["--search-url", "--pages", "--max-details", "--transport"]);
  const booleanFlags = new Set(["--confirm", "--dry-run"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (booleanFlags.has(key)) { values.set(key, true); continue; }
    if (!valueFlags.has(key)) throw new JobKoreaTransportError("JOBKOREA_CLI_ARGUMENT_INVALID", `지원하지 않는 인자입니다: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new JobKoreaTransportError("JOBKOREA_CLI_ARGUMENT_INVALID", `${key} 값이 필요합니다.`);
    values.set(key, value);
    index += 1;
  }
  if (!values.has("--confirm")) throw new JobKoreaTransportError("JOBKOREA_CONFIRMATION_REQUIRED", "실행하려면 --confirm 플래그가 필요합니다.");
  const searchCandidate = values.get("--search-url");
  if (typeof searchCandidate !== "string") throw new JobKoreaTransportError("JOBKOREA_SEARCH_URL_REQUIRED", "--search-url이 필요합니다.");
  const pages = Number(values.get("--pages"));
  if (pages !== 1 && pages !== 2) throw new JobKoreaTransportError("JOBKOREA_SEARCH_PAGES_INVALID", "--pages는 1 또는 2여야 합니다.");
  const maxDetails = Number(values.get("--max-details"));
  if (!Number.isInteger(maxDetails) || maxDetails < 0 || maxDetails > 3) throw new JobKoreaTransportError("JOBKOREA_MAX_DETAILS_INVALID", "--max-details는 0, 1, 2, 3 중 하나여야 합니다.");
  const transport = (values.get("--transport") ?? "auto") as JobKoreaSearchTransportChoice;
  if (!(["auto", "playwright", "direct"] as const).includes(transport)) throw new JobKoreaTransportError("JOBKOREA_TRANSPORT_SELECTION_INVALID", "--transport는 auto, playwright, direct 중 하나여야 합니다.");
  if (transport === "direct" && pages !== 1) throw new JobKoreaTransportError("JOBKOREA_DIRECT_PAGE_LIMIT", "direct 검증은 요청 한도상 --pages 1만 허용합니다.");
  return { searchUrl: normalizeJobKoreaSearchUrl(searchCandidate), pages, maxDetails: maxDetails as 0 | 1 | 2 | 3,
    transport, confirm: true, dryRun: values.has("--dry-run") };
}
