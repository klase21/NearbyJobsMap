import { getDatabasePath, openReadonlyDatabase } from "../src/db/connection";
import { auditJobKoreaDataQuality, assertJobKoreaDatabaseIntegrity } from "../src/sources/jobkorea/backfill/jobkorea-quality-audit";

const database = openReadonlyDatabase(getDatabasePath());
try {
  assertJobKoreaDatabaseIntegrity(database);
  const audit = auditJobKoreaDataQuality(database);
  const count = (sql: string): number => Number((database.prepare(sql).get() as { count: number }).count);
  const businessCounts = {
    jobs: count("SELECT COUNT(*) count FROM jobs"),
    jobkorea: count("SELECT COUNT(*) count FROM jobs WHERE source='jobkorea'"),
    jobkoreaLive: count("SELECT COUNT(*) count FROM jobs WHERE source='jobkorea' AND provenance_kind='live_one_shot_observation'"),
    jobkoreaFixture: count("SELECT COUNT(*) count FROM jobs WHERE source='jobkorea' AND provenance_kind='fixture_derived'"),
    jobkoreaFictional: count("SELECT COUNT(*) count FROM jobs WHERE source='jobkorea' AND is_fictional=1"),
    albamon: count("SELECT COUNT(*) count FROM jobs WHERE source='albamon'"),
    runs: count("SELECT COUNT(*) count FROM ingestion_runs"), items: count("SELECT COUNT(*) count FROM ingestion_items"),
    provenance: count("SELECT COUNT(*) count FROM job_provenance_history"), observations: count("SELECT COUNT(*) count FROM job_observations"),
    changeEvents: count("SELECT COUNT(*) count FROM job_change_events"),
    duplicateIdentities: count("SELECT COUNT(*) count FROM (SELECT source,source_posting_id FROM jobs GROUP BY source,source_posting_id HAVING COUNT(*)>1)"),
  };
  const freshness = database.prepare(`SELECT
    SUM(CASE WHEN julianday('now')-julianday(last_seen_at)<7 THEN 1 ELSE 0 END) recent,
    SUM(CASE WHEN julianday('now')-julianday(last_seen_at)>=7 AND julianday('now')-julianday(last_seen_at)<14 THEN 1 ELSE 0 END) stale_7,
    SUM(CASE WHEN julianday('now')-julianday(last_seen_at)>=14 AND julianday('now')-julianday(last_seen_at)<30 THEN 1 ELSE 0 END) stale_14,
    SUM(CASE WHEN julianday('now')-julianday(last_seen_at)>=30 THEN 1 ELSE 0 END) stale_30
    FROM (SELECT job_id, MAX(observed_at) last_seen_at FROM job_observations GROUP BY job_id) f
    JOIN jobs j ON j.id=f.job_id WHERE j.source='jobkorea'`).get();
  const changedFields: Record<string, number> = {};
  for (const row of database.prepare(`SELECT e.changed_fields_json FROM job_change_events e JOIN jobs j ON j.id=e.job_id WHERE j.source='jobkorea'`).all() as Array<{ changed_fields_json: string }>) {
    for (const field of JSON.parse(row.changed_fields_json) as string[]) changedFields[field] = (changedFields[field] ?? 0) + 1;
  }
  console.log(JSON.stringify({ integrity: "ok", businessCounts, audit, freshness, changedFields }, null, 2));
} finally { database.close(); }
