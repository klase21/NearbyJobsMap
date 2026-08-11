import { NextResponse } from "next/server";
import { DEFAULT_PREFERENCES, validateJobFilterState } from "../../../repositories/preferences-repository";
import type { SortOption } from "../../../domain/ui-job";
import { getJobsPage } from "../../../server/jobs-page/service";
import type { JobsPageRequest, WorkspaceView } from "../../../server/jobs-page/contracts";

export const dynamic = "force-dynamic";
const sorts = new Set<SortOption>(["newest","deadline","distance","monthly_distance","hourly","daily","monthly","annual","normalized_monthly","company"]);
const workspaceViews = new Set<WorkspaceView>(["all","favorite","apply_planned","applied","waiting","interview","archived","hidden"]);

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_REQUEST");
    const value=body as Record<string,unknown>;
    if (!validateJobFilterState(value.filters)) throw new Error("INVALID_FILTERS");
    if (typeof value.sort!=="string"||!sorts.has(value.sort as SortOption)) throw new Error("INVALID_SORT");
    if (typeof value.workspaceView!=="string"||!workspaceViews.has(value.workspaceView as WorkspaceView)) throw new Error("INVALID_WORKSPACE_VIEW");
    if (typeof value.applyPersonalExclusions!=="boolean") throw new Error("INVALID_PERSONAL_EXCLUSIONS");
    const query: JobsPageRequest={page:Number(value.page),pageSize:Number(value.pageSize),filters:value.filters,sort:value.sort as SortOption,
      workspaceView:value.workspaceView as WorkspaceView,applyPersonalExclusions:value.applyPersonalExclusions};
    if (value.origin && typeof value.origin==="object" && !Array.isArray(value.origin)) {
      const origin=value.origin as Record<string,unknown>;
      if (typeof origin.latitude==="number"&&typeof origin.longitude==="number"&&Number.isFinite(origin.latitude)&&Number.isFinite(origin.longitude)) query.origin={latitude:origin.latitude,longitude:origin.longitude};
    }
    return NextResponse.json(getJobsPage(query));
  } catch (error) {
    const code=error instanceof Error?error.message:"INVALID_REQUEST";
    return NextResponse.json({error:{code,message:"요청한 공고 페이지 조건이 올바르지 않습니다."}},{status:400});
  }
}

export async function GET() {
  return NextResponse.json(getJobsPage({ page:1,pageSize:50,filters:DEFAULT_PREFERENCES.filters,sort:DEFAULT_PREFERENCES.sort,
    workspaceView:"all",applyPersonalExclusions:process.env.NEARBY_JOBS_REAL_USE_MODE==="1" }));
}
