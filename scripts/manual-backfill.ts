import { getManualBackfillManager } from "../src/server/manual-backfill/manager";
import { resolveBackfillCutoff } from "../src/server/manual-backfill/validation";
import { formatPersonalBackfillProfilePreflight, resolveBackfillConfig } from "../src/server/manual-backfill/profile-resolution";
import { EXCLUSION_FIELDS, type ExclusionField } from "../src/services/collection-exclusion";

const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const values = (name: string) => args.flatMap((item, index) => item === name && args[index + 1] ? [args[index + 1]!] : []);

async function main() {
  const source = value("--source");
  const profile = value("--profile");
  const days = value("--days");
  const since = value("--since");
  const maxPages = value("--max-pages");
  const keywords = values("--exclude-keyword");
  const fields = values("--exclude-field");
  if (fields.some((field) => !EXCLUSION_FIELDS.includes(field as ExclusionField))) throw new Error("BACKFILL_EXCLUSION_FIELD_INVALID");
  const scope = source === "albamon" ? "albamon_personal_all" : "date_cutoff";
  const cutoffDate = scope === "date_cutoff" ? resolveBackfillCutoff({ days: days ? Number(days) : undefined, since }) : null;
  if (source === "albamon" && profile !== "personal") throw new Error("BACKFILL_PERSONAL_PROFILE_REQUIRED");
  const config = resolveBackfillConfig({ source, scope, cutoffDate, maxPages: maxPages ? Number(maxPages) : undefined,
    exclusion: { keywords, fields: fields as ExclusionField[] } });
  if (config.source === "albamon") console.log(formatPersonalBackfillProfilePreflight(config));
  if (args.includes("--preflight")) return;

  const manager = getManualBackfillManager();
  const wait = async (id: string) => {
    for (;;) {
      const run = manager.get(id);
      if (!run) throw new Error("BACKFILL_RUN_MISSING");
      if (["completed", "failed", "cancelled"].includes(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };
  const preview = await wait(manager.start({ ...config, mode: "dry_run" }).id);
  console.log(JSON.stringify(preview, null, 2));
  if (preview.status !== "completed") { process.exitCode = 1; return; }
  if (args.includes("--confirm")) {
    if (!preview.writeAuthorizationToken) throw new Error("BACKFILL_AUTHORIZATION_MISSING");
    const write = manager.start({ ...config, mode: "write", writeAuthorizationToken: preview.writeAuthorizationToken,
      confirmationPhrase: `BACKFILL ${config.source} ${config.scope === "albamon_personal_all" ? "ALL" : config.cutoffDate}` });
    const completed = await wait(write.id);
    console.log(JSON.stringify(completed, null, 2));
    if (completed.status !== "completed") process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof value.code === "string" ? value.code : "BACKFILL_CLI_FAILED";
  const message = typeof value.message === "string" ? value.message.slice(0, 500) : "백필 명령을 처리하지 못했습니다.";
  console.error(`${code}: ${message}`);
  process.exitCode = 1;
});
