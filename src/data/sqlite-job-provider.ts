import "server-only";
import { loadUiJobsFromDatabase } from "../db/services/ui-data-service";

export function getPersistedUiJobs() {
  const result = loadUiJobsFromDatabase();
  if (process.env.NEARBY_JOBS_REAL_USE_MODE !== "1") return result;
  return { ...result, jobs: result.jobs.filter((record) => record.provenanceKind === "live_one_shot_observation") };
}
