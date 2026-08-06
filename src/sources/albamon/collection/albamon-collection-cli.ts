import { getAlbamonCollectionPreset } from "./albamon-collection-presets";
import type { AlbamonCollectionCliOptions } from "./albamon-collection-types";

export function parseAlbamonCollectionArgs(args: string[]): AlbamonCollectionCliOptions {
  const values = new Map<string, string>(); const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!; if (!arg.startsWith("--")) throw new Error("ALBAMON_CLI_ARGUMENT_INVALID");
    if (["--dry-run", "--write", "--confirm"].includes(arg)) { flags.add(arg); continue; }
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error("ALBAMON_CLI_VALUE_REQUIRED"); values.set(arg, value);
  }
  const preset = getAlbamonCollectionPreset(values.get("--preset") ?? "");
  if (!preset) throw new Error("ALBAMON_PRESET_INVALID");
  const pages = Number(values.get("--pages") ?? preset.pages); const maxDetails = Number(values.get("--max-details") ?? preset.maxDetails);
  if (!Number.isInteger(pages) || pages < 1 || pages > preset.pages || pages > 5) throw new Error("ALBAMON_PAGES_INVALID");
  if (!Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > preset.maxDetails || maxDetails > 50) throw new Error("ALBAMON_MAX_DETAILS_INVALID");
  if (flags.has("--write") === flags.has("--dry-run") || !flags.has("--confirm")) throw new Error("ALBAMON_MODE_CONFIRMATION_INVALID");
  return { presetId: preset.id, presetLabel: preset.label, pages: pages as 1|2|3|4|5, maxDetails,
    mode: flags.has("--write") ? "write" : "dry-run", confirm: true, requestedRegions: preset.regions };
}
