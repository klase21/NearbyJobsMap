import { normalizeJobKoreaUrl } from "./jobkorea-url-policy";
import { JobKoreaTransportError } from "./jobkorea-error";
import type { JobKoreaTransportOptions } from "./types";

export function parseJobKoreaCliArgs(argv: string[]): JobKoreaTransportOptions {
  const values = new Map<string, string | true>();
  const valueFlags = new Set(["--listing-url", "--max-details"]);
  const booleanFlags = new Set(["--confirm", "--dry-run"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (booleanFlags.has(key)) { values.set(key, true); continue; }
    if (!valueFlags.has(key)) throw new JobKoreaTransportError("JOBKOREA_CLI_ARGUMENT_INVALID", `지원하지 않는 인자입니다: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new JobKoreaTransportError("JOBKOREA_CLI_ARGUMENT_INVALID", `${key} 값이 필요합니다.`);
    values.set(key, value); index += 1;
  }
  if (!values.has("--confirm")) throw new JobKoreaTransportError("JOBKOREA_CONFIRMATION_REQUIRED", "실행하려면 --confirm 플래그가 필요합니다.");
  const listingCandidate = values.get("--listing-url");
  if (typeof listingCandidate !== "string") throw new JobKoreaTransportError("JOBKOREA_LISTING_URL_REQUIRED", "--listing-url이 필요합니다.");
  const maximumCandidate = values.get("--max-details") ?? "1";
  const maximum = typeof maximumCandidate === "string" ? Number(maximumCandidate) : Number.NaN;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3) throw new JobKoreaTransportError("JOBKOREA_MAX_DETAILS_INVALID", "--max-details는 1, 2, 3 중 하나여야 합니다.");
  return { listingUrl: normalizeJobKoreaUrl(listingCandidate, "listing"), maxDetails: maximum as 1 | 2 | 3,
    confirm: true, dryRun: values.has("--dry-run") };
}
