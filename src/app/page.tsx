import { connection } from "next/server";
import { headers } from "next/headers";
import { NearbyJobsDashboard } from "../components/dashboard/NearbyJobsDashboard";
import { DatabaseSetupState } from "../components/dashboard/DatabaseSetupState";
import { DatabaseAccessError } from "../db/connection";
import { getLocalReadiness } from "../server/local-readiness/service";
import { getJobsPage } from "../server/jobs-page/service";
import { DEFAULT_PREFERENCES } from "../repositories/preferences-repository";

export default async function HomePage() {
  await connection();
  const readiness = getLocalReadiness((await headers()).get("host"));
  try {
    const result = getJobsPage({ page: 1, pageSize: 50, filters: DEFAULT_PREFERENCES.filters, sort: DEFAULT_PREFERENCES.sort,
      workspaceView: "all", applyPersonalExclusions: process.env.NEARBY_JOBS_REAL_USE_MODE === "1" });
    if (result.diagnostics.length) console.warn("DB_ROW_VALIDATION_SKIPPED", result.diagnostics.map(({ jobId, code }) => ({ jobId, code })));
    return <NearbyJobsDashboard initialPage={result} readiness={readiness} dataWarning={result.diagnostics.length ? `정상적으로 읽을 수 없는 공고 ${result.diagnostics.length}건을 제외하고 표시합니다.` : undefined} />;
  } catch (error) {
    if (error instanceof DatabaseAccessError) {
      if (error.code === "DATABASE_NOT_READY") return <DatabaseSetupState kind="not_ready" />;
      if (error.code === "DATABASE_CORRUPT") return <DatabaseSetupState kind="corrupt" />;
    }
    console.error("LOCAL_DATABASE_LOAD_FAILED", error instanceof Error ? error.message : "unknown");
    return <DatabaseSetupState kind="unavailable" />;
  }
}
