import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { GET as listViews, POST as createView } from "../../app/api/saved-job-views/route";
import { PATCH as updateView, DELETE as deleteView } from "../../app/api/saved-job-views/[viewId]/route";
import { PATCH as patchJobState } from "../../app/api/job-user-state/[jobId]/route";
import { POST as startCollection } from "../../app/api/collection-runs/route";
import { JobRepository } from "../../db/repositories/job-repository";
import { DEFAULT_FILTERS } from "../../services/job-search";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "../db/test-database";

let test:TestDatabase|null=null;
const originalPath=process.env.NEARBY_JOBS_DB_PATH;
const originalCollectionFlag=process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;
afterEach(()=>{test?.cleanup();test=null;if(originalPath===undefined)delete process.env.NEARBY_JOBS_DB_PATH;else process.env.NEARBY_JOBS_DB_PATH=originalPath;if(originalCollectionFlag===undefined)delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;else process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI=originalCollectionFlag;});

function setup(){test=createTestDatabase();process.env.NEARBY_JOBS_DB_PATH=test.path;delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;new JobRepository(test.database).upsert(canonicalJob(),{recordKind:"fixture_derived",evidenceType:"observed_html",sourceFixtureReference:"sanitized-test",mapPosition:null});return test;}

describe("personal workspace API feature boundary",()=>{
  it("lists saved views without enabling collection management",async()=>{setup();const response=await listViews(new Request("http://localhost/api/saved-job-views"));expect(response.status).toBe(200);expect(await response.json()).toEqual({views:[]});});
  it("creates, updates, and deletes saved views without the collection feature flag",async()=>{setup();const created=await createView(new Request("http://localhost/api/saved-job-views",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"로컬 보기",filters:DEFAULT_FILTERS,isFavorite:false,isDefault:false})}));expect(created.status).toBe(201);const view=(await created.json()).view;const updated=await updateView(new Request(`http://localhost/api/saved-job-views/${view.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:"수정된 로컬 보기",filters:DEFAULT_FILTERS,isFavorite:true,isDefault:false})}),{params:Promise.resolve({viewId:view.id})});expect(updated.status).toBe(200);const removed=await deleteView(new Request(`http://localhost/api/saved-job-views/${view.id}`,{method:"DELETE"}),{params:Promise.resolve({viewId:view.id})});expect(removed.status).toBe(204);});
  it("patches job user state without COLLECTION_UI_DISABLED",async()=>{setup();const response=await patchJobState(new Request("http://localhost/api/job-user-state/jobkorea:1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({isFavorite:true,workflowStatus:"apply_planned",isHidden:false,isArchived:false,note:"",applicationDate:null,followUpAt:null,personalDeadline:null})}),{params:Promise.resolve({jobId:"jobkorea:1"})});expect(response.status).toBe(200);expect((await response.json()).state).toMatchObject({jobId:"jobkorea:1",isFavorite:true,workflowStatus:"apply_planned"});});
  it("keeps actual collection start gated while the feature is disabled",async()=>{setup();const response=await startCollection(new Request("http://localhost/api/collection-runs",{method:"POST"}));expect(response.status).toBe(403);expect((await response.json()).error.code).toBe("COLLECTION_UI_DISABLED");});
});
