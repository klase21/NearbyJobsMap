import { getAlbamonCollectionPreset } from "./albamon-collection-presets";
import type { AlbamonCollectionCliOptions } from "./albamon-collection-types";
import { normalizeCollectionExclusionConfig, type ExclusionField } from "../../../services/collection-exclusion";

export function parseAlbamonCollectionArgs(args: string[]): AlbamonCollectionCliOptions {
  const values = new Map<string, string>(); const repeated = new Map<string, string[]>(); const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!; if (!arg.startsWith("--")) throw new Error("ALBAMON_CLI_ARGUMENT_INVALID");
    if (["--dry-run", "--write", "--confirm", "--diagnostic"].includes(arg)) { flags.add(arg); continue; }
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error("ALBAMON_CLI_VALUE_REQUIRED");
    if (arg === "--exclude-keyword" || arg === "--exclude-field") repeated.set(arg, [...(repeated.get(arg) ?? []), value]);
    else if (["--preset", "--pages", "--max-details"].includes(arg)) values.set(arg, value); else throw new Error("ALBAMON_CLI_ARGUMENT_INVALID");
  }
  const preset = getAlbamonCollectionPreset(values.get("--preset") ?? "");
  if (!preset) throw new Error("ALBAMON_PRESET_INVALID");
  const pages = Number(values.get("--pages") ?? preset.pages); const maxDetails = Number(values.get("--max-details") ?? preset.maxDetails);
  if (!Number.isInteger(pages) || pages < 1 || pages > preset.pages || pages > 5) throw new Error("ALBAMON_PAGES_INVALID");
  if (!Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > preset.maxDetails || maxDetails > 50) throw new Error("ALBAMON_MAX_DETAILS_INVALID");
  if (flags.has("--write") === flags.has("--dry-run") || !flags.has("--confirm")) throw new Error("ALBAMON_MODE_CONFIRMATION_INVALID");
  if (!(repeated.get("--exclude-keyword")?.length) && repeated.get("--exclude-field")?.length) throw new Error("ALBAMON_EXCLUSION_FIELDS_WITHOUT_KEYWORDS");
  return { presetId: preset.id, presetLabel: preset.label, pages: pages as 1|2|3|4|5, maxDetails,
    mode: flags.has("--write") ? "write" : "dry-run", confirm: true, requestedRegions: preset.regions,
    diagnostic: flags.has("--diagnostic"),
    exclusion: normalizeCollectionExclusionConfig({ keywords: repeated.get("--exclude-keyword") ?? [], fields: (repeated.get("--exclude-field") ?? []) as ExclusionField[] }) };
}
