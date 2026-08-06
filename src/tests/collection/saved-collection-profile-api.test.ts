import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { GET as listProfiles,POST as createProfile } from "../../app/api/collection-profiles/route";
import { PATCH as updateProfile,DELETE as deleteProfile } from "../../app/api/collection-profiles/[profileId]/route";
import { POST as duplicateProfile } from "../../app/api/collection-profiles/[profileId]/duplicate/route";
import { POST as favoriteProfile } from "../../app/api/collection-profiles/[profileId]/favorite/route";
import { createTestDatabase,type TestDatabase } from "../db/test-database";

let testDatabase:TestDatabase;
beforeEach(()=>{testDatabase=createTestDatabase();process.env.NEARBY_JOBS_DB_PATH=testDatabase.path;process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI="1";});
afterEach(()=>{testDatabase.cleanup();delete process.env.NEARBY_JOBS_DB_PATH;delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;});
const body=(name="테스트 프로필")=>({name,source:"jobkorea",basePresetId:"capital-ai",strategy:"jobkorea_keyword",keyword:"AI",regions:["seoul","gyeonggi"],pages:2,maxCandidates:20,allowListingFallback:true,exclusion:{keywords:["강사"],fields:["title","category"]},isFavorite:true});
const request=(path:string,method="GET",value?:unknown,host="localhost")=>new Request(`http://${host}${path}`,{method,headers:{origin:`http://${host}`,...(value?{"content-type":"application/json"}:{})},...(value?{body:JSON.stringify(value)}:{})});

describe("saved profile local APIs",()=>{
 it("creates, lists, updates, favorites, duplicates, and deletes a profile",async()=>{const createdResponse=await createProfile(request("/api/collection-profiles","POST",body()));expect(createdResponse.status).toBe(201);const created=(await createdResponse.json()).profile;expect((await (await listProfiles(request("/api/collection-profiles"))).json()).profiles).toHaveLength(1);
   const updatedResponse=await updateProfile(request(`/api/collection-profiles/${created.id}`,"PATCH",{...body(),pages:1,expectedRevision:1}),{params:Promise.resolve({profileId:created.id})});expect(updatedResponse.status).toBe(200);const updated=(await updatedResponse.json()).profile;expect(updated.revision).toBe(2);
   const favoriteResponse=await favoriteProfile(request(`/api/collection-profiles/${created.id}/favorite`,"POST",{expectedRevision:2,isFavorite:false}),{params:Promise.resolve({profileId:created.id})});expect((await favoriteResponse.json()).profile.revision).toBe(2);
   const duplicateResponse=await duplicateProfile(request(`/api/collection-profiles/${created.id}/duplicate`,"POST",{}),{params:Promise.resolve({profileId:created.id})});expect(duplicateResponse.status).toBe(201);const copy=(await duplicateResponse.json()).profile;expect(copy.name).toMatch(/복사본/);
   expect((await deleteProfile(request(`/api/collection-profiles/${copy.id}`,"DELETE"),{params:Promise.resolve({profileId:copy.id})})).status).toBe(204);
 });
 it("rejects non-local, disabled, and unexpected executable fields",async()=>{expect((await listProfiles(request("/api/collection-profiles","GET",undefined,"example.com"))).status).toBe(403);delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;expect((await listProfiles(request("/api/collection-profiles"))).status).toBe(403);process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI="1";const rejected=await createProfile(request("/api/collection-profiles","POST",{...body(),url:"https://evil",command:"rm"}));expect(rejected.status).toBe(400);expect(JSON.stringify(await rejected.json())).not.toMatch(/stack|sqlite/i);});
 it("returns duplicate-name and stale-revision conflicts",async()=>{const first=await createProfile(request("/api/collection-profiles","POST",body("AI Profile")));const profile=(await first.json()).profile;expect((await createProfile(request("/api/collection-profiles","POST",body("ai profile")))).status).toBe(409);const stale=await updateProfile(request(`/api/collection-profiles/${profile.id}`,"PATCH",{...body("AI Profile"),expectedRevision:99}),{params:Promise.resolve({profileId:profile.id})});expect(stale.status).toBe(409);});
});
