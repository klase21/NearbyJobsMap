import { NextResponse } from "next/server";
import type { SortOption } from "../../../../domain/ui-job";
import { validateJobFilterState } from "../../../../repositories/preferences-repository";
import type { JobsPageRequest, WorkspaceView } from "../../../../server/jobs-page/contracts";
import { getDuplicateJobGroup } from "../../../../server/jobs-page/service";

export const dynamic="force-dynamic";
const sorts=new Set<SortOption>(["newest","deadline","distance","monthly_distance","hourly","daily","monthly","annual","normalized_monthly","company"]);
const workspaceViews=new Set<WorkspaceView>(["all","favorite","apply_planned","applied","waiting","interview","archived","hidden"]);

export async function POST(request:Request){
  try{
    const body:unknown=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("INVALID_REQUEST");const value=body as Record<string,unknown>;
    if(typeof value.representativeId!=="string"||!validateJobFilterState(value.filters)||typeof value.sort!=="string"||!sorts.has(value.sort as SortOption)||typeof value.workspaceView!=="string"||!workspaceViews.has(value.workspaceView as WorkspaceView)||typeof value.applyPersonalExclusions!=="boolean")throw new Error("INVALID_REQUEST");
    const query:JobsPageRequest={page:Number(value.page),pageSize:Number(value.pageSize),filters:value.filters,sort:value.sort as SortOption,
      workspaceView:value.workspaceView as WorkspaceView,applyPersonalExclusions:value.applyPersonalExclusions};
    if(value.origin&&typeof value.origin==="object"&&!Array.isArray(value.origin)){const origin=value.origin as Record<string,unknown>;if(typeof origin.latitude==="number"&&typeof origin.longitude==="number"&&Number.isFinite(origin.latitude)&&Number.isFinite(origin.longitude))query.origin={latitude:origin.latitude,longitude:origin.longitude};}
    return NextResponse.json(getDuplicateJobGroup(query,value.representativeId));
  }catch{return NextResponse.json({error:{code:"INVALID_DUPLICATE_GROUP_REQUEST",message:"중복 공고 요청이 올바르지 않습니다."}},{status:400});}
}
