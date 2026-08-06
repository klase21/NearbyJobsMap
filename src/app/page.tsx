import { connection } from "next/server";
import { headers } from "next/headers";
import { NearbyJobsDashboard } from "../components/dashboard/NearbyJobsDashboard";
import { DatabaseSetupState } from "../components/dashboard/DatabaseSetupState";
import { DatabaseAccessError } from "../db/connection";
import { getPersistedUiJobs } from "../data/sqlite-job-provider";
import { getLocalReadiness } from "../server/local-readiness/service";

export default async function HomePage() {
  await connection();
  const readiness = getLocalReadiness((await headers()).get("host"));
  try {
    const result = getPersistedUiJobs();
    if (result.diagnostics.length) console.warn("DB_ROW_VALIDATION_SKIPPED", result.diagnostics.map(({ jobId, code }) => ({ jobId, code })));
    return <NearbyJobsDashboard initialJobs={result.jobs} readiness={readiness} dataWarning={result.diagnostics.length ? `손상된 로컬 공고 ${result.diagnostics.length}건을 제외하고 표시합니다.` : undefined} />;
  } catch (error) {
    if (error instanceof DatabaseAccessError) {
      if (error.code === "DATABASE_NOT_READY") return <DatabaseSetupState kind="not_ready" />;
      if (error.code === "DATABASE_CORRUPT") return <DatabaseSetupState kind="corrupt" />;
    }
    console.error("LOCAL_DATABASE_LOAD_FAILED", error instanceof Error ? error.message : "unknown");
    return <DatabaseSetupState kind="unavailable" />;
  }
}
