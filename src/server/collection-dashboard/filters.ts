import type { CollectionDashboardFilters, DashboardPeriod, DashboardRunStatus, DashboardSource } from "./contracts";

const PERIODS = new Set<DashboardPeriod>(["7d", "30d", "all"]);
const SOURCES = new Set<DashboardSource>(["all", "jobkorea", "albamon"]);
const STATUSES = new Set<DashboardRunStatus>(["all", "completed", "failed"]);

export function parseDashboardFilters(url: URL): CollectionDashboardFilters {
  const period = url.searchParams.get("period") ?? "30d";
  const source = url.searchParams.get("source") ?? "all";
  const status = url.searchParams.get("status") ?? "all";
  if (!PERIODS.has(period as DashboardPeriod)) throw invalid("period");
  if (!SOURCES.has(source as DashboardSource)) throw invalid("source");
  if (!STATUSES.has(status as DashboardRunStatus)) throw invalid("status");
  for (const key of url.searchParams.keys()) if (!["period", "source", "status"].includes(key)) throw invalid(key);
  return { period: period as DashboardPeriod, source: source as DashboardSource, status: status as DashboardRunStatus };
}

export function assertDashboardRunId(runId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) {
    throw Object.assign(new Error("올바른 수집 실행 ID가 아닙니다."), { code: "COLLECTION_DASHBOARD_RUN_ID_INVALID", status: 400 });
  }
  return runId;
}

function invalid(field: string): Error {
  return Object.assign(new Error(`대시보드 ${field} 필터가 올바르지 않습니다.`), { code: "COLLECTION_DASHBOARD_FILTER_INVALID", status: 400 });
}
