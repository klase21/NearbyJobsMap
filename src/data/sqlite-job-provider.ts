import "server-only";
import { loadUiJobsFromDatabase } from "../db/services/ui-data-service";

export function getPersistedUiJobs() {
  return loadUiJobsFromDatabase();
}
