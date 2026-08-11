import { getDatabasePath, openWritableDatabase } from "../src/db/connection";

if (!process.argv.includes("--confirm") || process.argv[process.argv.indexOf("--confirm") + 1] !== "CLEAN LOCAL DEMO DATA") {
  console.error('Run with --confirm "CLEAN LOCAL DEMO DATA"'); process.exit(1);
}
const database = openWritableDatabase(getDatabasePath());
try {
  const before = database.prepare("SELECT provenance_kind kind, COUNT(*) count FROM jobs GROUP BY provenance_kind").all();
  const removed = database.transaction(() => {
    database.prepare("DELETE FROM ingestion_runs WHERE ingestion_type IN ('sanitized_fixture','fictional_demo_seed')").run();
    return database.prepare("DELETE FROM jobs WHERE provenance_kind IN ('fixture_derived','fictional_demo')").run().changes;
  })();
  const scalar = (sql: string) => String((database.prepare(sql).get() as Record<string, unknown>)[Object.keys(database.prepare(sql).get() as object)[0]!] ?? "");
  const checks = {
    integrity: database.pragma("integrity_check", { simple: true }),
    foreignKeys: (database.pragma("foreign_key_check") as unknown[]).length,
    duplicateIdentities: scalar("SELECT COUNT(*) count FROM (SELECT source,source_posting_id FROM jobs WHERE source_posting_id<>'' GROUP BY source,source_posting_id HAVING COUNT(*)>1)"),
    orphanProvenance: scalar("SELECT COUNT(*) count FROM job_provenance_history p LEFT JOIN jobs j ON j.id=p.job_id WHERE j.id IS NULL"),
    orphanObservations: scalar("SELECT COUNT(*) count FROM job_observations o LEFT JOIN jobs j ON j.id=o.job_id WHERE j.id IS NULL"),
    orphanUserState: scalar("SELECT COUNT(*) count FROM job_user_state s LEFT JOIN jobs j ON j.id=s.job_id WHERE j.id IS NULL"),
  };
  console.log(JSON.stringify({ before, removedJobs: removed, after: database.prepare("SELECT provenance_kind kind, COUNT(*) count FROM jobs GROUP BY provenance_kind").all(), checks }, null, 2));
  if (checks.integrity !== "ok" || checks.foreignKeys || Object.values(checks).slice(2).some((value) => value !== "0")) process.exitCode = 1;
} finally { database.close(); }
