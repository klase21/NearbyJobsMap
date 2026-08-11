import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { JobRepository } from "../../db/repositories/job-repository";
import type { IngestionMetadata } from "../../db/schema";
import { DEFAULT_FILTERS } from "../../services/job-search";
import { getDuplicateJobGroup, getJobsPage } from "../../server/jobs-page/service";
import { validateJobsPageRequest } from "../../server/jobs-page/contracts";
import { normalizeSemanticJobText, semanticJobGroupKey } from "../../services/semantic-job-group";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "../db/test-database";
import type { PersonalAlbamonProfileState } from "../../server/personal-albamon-profile/service";

let test:TestDatabase|null=null;
afterEach(()=>{test?.cleanup();test=null;});

function seed(count=130){
  test=createTestDatabase();
  const repository=new JobRepository(test.database);
  for(let index=1;index<=count;index++){
    const source=index%2?"jobkorea" as const:"albamon" as const;
    const seoul=index%3!==0;
    const metadata:IngestionMetadata={recordKind:"live_one_shot_observation",evidenceType:"public_page_observation",sourceFixtureReference:"bounded-test-contract",mapPosition:null,observationKind:"bounded_listing_collection",normalizedRegions:[seoul?"seoul":"gyeonggi"],regionConfidence:"mapped_city",regionEvidenceSource:"mapped_displayed_location",postingDateEvidence:index<=60?"오늘":"어제",postingDateStatus:index<=60?"today":"older",postingDateLocalDate:index<=60?"2026-08-07":"2026-08-06"};
    repository.upsert(canonicalJob({id:`${source}:${index}`,source,sourcePostingId:String(index),sourceUrl:source==="jobkorea"?`https://www.jobkorea.co.kr/Recruit/GI_Read/${index}`:`https://www.albamon.com/jobs/detail/${index}`,canonicalUrl:source==="jobkorea"?`https://www.jobkorea.co.kr/Recruit/GI_Read/${index}`:`https://www.albamon.com/jobs/detail/${index}`,title:index===7?"특별 검색 공고":`공고 ${index}`,companyName:`회사 ${index}`,normalizedCompanyName:`회사 ${index}`,city:seoul?"서울":"경기",district:seoul?"강남구":"성남시",addressOriginalText:seoul?"서울 강남구":"경기 성남시",categories:[index%2?"개발":"운영"],employmentTypes:[index%2?"정규직":"계약직"],salary:{...canonicalJob().salary,type:"monthly",originalText:`월급 ${200+index}만원`,minimumAmount:(200+index)*10_000,maximumAmount:(200+index)*10_000},postedAt:index<=60?`2026-08-07T${String(index%24).padStart(2,"0")}:00:00+09:00`:`2026-08-06T12:00:00+09:00`,collectedAt:index<=60?"2026-08-07T01:00:00.000Z":"2026-08-06T01:00:00.000Z",lastVerifiedAt:"2026-08-07T01:00:00.000Z"}),metadata);
    test.database.prepare("UPDATE jobs SET created_at=? WHERE id=?").run(index<=60?"2026-08-07T01:00:00.000Z":"2026-08-06T01:00:00.000Z",`${source}:${index}`);
  }
  return test;
}

const query=(overrides:Partial<Parameters<typeof getJobsPage>[0]>={})=>getJobsPage({page:1,pageSize:50,filters:{...DEFAULT_FILTERS,salaryThresholds:{...DEFAULT_FILTERS.salaryThresholds}},sort:"newest",workspaceView:"all",...overrides},test!.path,new Date("2026-08-07T12:00:00+09:00"));
const personalState=(keywords:string[]):PersonalAlbamonProfileState=>({configured:true,profile:{version:1,albamon:{areas:"I000,B000",searchPeriodType:"ALL",sortType:"MONTHLY_SALARY",excludeBar:true,exclusions:keywords},updatedAt:"2026-08-11T01:00:00.000Z"},profileHash:"TEST_HASH"});
const queryPersonal=(keywords:string[],overrides:Partial<Parameters<typeof getJobsPage>[0]>={})=>getJobsPage({page:1,pageSize:50,filters:{...DEFAULT_FILTERS,salaryThresholds:{...DEFAULT_FILTERS.salaryThresholds}},sort:"newest",workspaceView:"all",applyPersonalExclusions:true,...overrides},test!.path,new Date("2026-08-07T12:00:00+09:00"),{loadPersonalProfile:()=>personalState(keywords)});

function seedDuplicateContract(){
  test=createTestDatabase();
  const repository=new JobRepository(test.database);
  const add=(id:string,source:"jobkorea"|"albamon",company:string,title:string,postedAt:string,region:"seoul"|"gyeonggi")=>repository.upsert(canonicalJob({id,source,sourcePostingId:id.split(":")[1]!,sourceUrl:source==="jobkorea"?`https://www.jobkorea.co.kr/Recruit/GI_Read/${id.split(":")[1]}`:`https://www.albamon.com/jobs/detail/${id.split(":")[1]}`,canonicalUrl:source==="jobkorea"?`https://www.jobkorea.co.kr/Recruit/GI_Read/${id.split(":")[1]}`:`https://www.albamon.com/jobs/detail/${id.split(":")[1]}`,companyName:company,normalizedCompanyName:normalizeSemanticJobText(company),title,city:region==="seoul"?"서울":"경기",addressOriginalText:region==="seoul"?"서울 강남구":"경기 성남시",postedAt,collectedAt:postedAt,lastVerifiedAt:postedAt}),{recordKind:"live_one_shot_observation",evidenceType:"public_page_observation",sourceFixtureReference:"semantic-group-contract",mapPosition:null,observationKind:"bounded_listing_collection",normalizedRegions:[region],regionConfidence:"mapped_city",regionEvidenceSource:"mapped_displayed_location"});
  add("jobkorea:101","jobkorea","테스트(주)","백엔드·개발자","2026-08-07T08:00:00+09:00","seoul");
  add("jobkorea:102","jobkorea","테스트 주","백엔드 개발자","2026-08-07T10:00:00+09:00","gyeonggi");
  add("jobkorea:103","jobkorea","다른 회사","백엔드 개발자","2026-08-07T11:00:00+09:00","seoul");
  add("jobkorea:104","jobkorea","테스트 주","프론트엔드 개발자","2026-08-07T12:00:00+09:00","seoul");
  add("albamon:201","albamon","테스트 주","백엔드 개발자","2026-08-07T13:00:00+09:00","seoul");
  test.database.prepare("INSERT INTO job_user_state(job_id,is_favorite,workflow_status,is_hidden,is_archived,note,created_at,updated_at) VALUES('jobkorea:101',1,'interested',0,0,'secondary state','2026-08-07','2026-08-07')").run();
  return test;
}

describe("bounded server-side jobs page",()=>{
  it("normalizes only conservative punctuation and spacing variance",()=>{expect(semanticJobGroupKey(" 테스트(주) ","백엔드·개발자")).toBe(semanticJobGroupKey("테스트 주","백엔드 개발자"));expect(semanticJobGroupKey("테스트 주","백엔드 개발자")).not.toBe(semanticJobGroupKey("테스트 주","프론트엔드 개발자"));});
  it("defaults to a bounded 50-item page and never returns the full dataset",()=>{seed();const result=query();expect(result.items).toHaveLength(50);expect(result.pagination).toMatchObject({page:1,pageSize:50,totalItems:130,totalPages:3,hasNext:true});});
  it("applies page-two offset with stable source identity ordering",()=>{seed();const first=query();const second=query({page:2});expect(second.items).toHaveLength(50);expect(new Set([...first.items,...second.items].map(r=>r.job.id)).size).toBe(100);});
  it("rejects invalid pages and page sizes above the allowlist",()=>{expect(()=>validateJobsPageRequest({page:0,pageSize:50,filters:DEFAULT_FILTERS,sort:"newest",workspaceView:"all"})).toThrow("INVALID_PAGE");expect(()=>validateJobsPageRequest({page:1,pageSize:101,filters:DEFAULT_FILTERS,sort:"newest",workspaceView:"all"})).toThrow("INVALID_PAGE_SIZE");});
  it("filters source, region, today-posted, and today-first-seen in SQL",()=>{seed();expect(query({filters:{...DEFAULT_FILTERS,source:"albamon"}}).pagination.totalItems).toBe(65);expect(query({filters:{...DEFAULT_FILTERS,region:"gyeonggi"}}).pagination.totalItems).toBe(43);expect(query({filters:{...DEFAULT_FILTERS,discoveryDate:"today_posted"}}).pagination.totalItems).toBe(60);expect(query({filters:{...DEFAULT_FILTERS,discoveryDate:"today_first_seen"}}).pagination.totalItems).toBe(60);});
  it("filters salary, employment type, and text search without loading all rows",()=>{seed();expect(query({filters:{...DEFAULT_FILTERS,employmentType:"계약직"}}).pagination.totalItems).toBe(65);expect(query({filters:{...DEFAULT_FILTERS,salaryType:"monthly",salaryThresholds:{...DEFAULT_FILTERS.salaryThresholds,monthly:3_000_000}}}).pagination.totalItems).toBe(31);const found=query({filters:{...DEFAULT_FILTERS,keyword:"특별 검색"}});expect(found.pagination.totalItems).toBe(1);expect(found.items[0]?.job.title).toBe("특별 검색 공고");});
  it("uses deterministic newest sorting and bounds map records to the page",()=>{seed();const result=query({pageSize:25});expect(result.items).toHaveLength(25);expect(result.summary.mapEligible).toBe(0);expect(result.items.every(r=>r.postingDateLocalDate==="2026-08-07")).toBe(true);});
  it("distinguishes an empty filter from an empty database",()=>{seed();const result=query({filters:{...DEFAULT_FILTERS,keyword:"존재하지 않는 검색어"}});expect(result.summary.total).toBe(130);expect(result.pagination.totalItems).toBe(0);expect(result.items).toEqual([]);});
  it("applies workspace state in SQL and returns only page-local state",()=>{const current=seed();const jobId="jobkorea:1";current.database.prepare("INSERT INTO job_user_state(job_id,is_favorite,workflow_status,is_hidden,is_archived,note,created_at,updated_at) VALUES(?,1,'interested',0,0,'','2026-08-07','2026-08-07')").run(jobId);const result=query({workspaceView:"favorite"});expect(result.pagination.totalItems).toBe(1);expect(result.items[0]?.job.id).toBe(jobId);expect(result.userStates).toHaveLength(1);});
  it("groups same-source normalized company and title while preserving every identity",()=>{const current=seedDuplicateContract();const before=Number((current.database.prepare("SELECT COUNT(*) count FROM jobs").get() as {count:number}).count);const result=query();expect(result.pagination.totalItems).toBe(4);expect(result.items.map(item=>item.job.id)).toContain("jobkorea:102");expect(result.items.map(item=>item.job.id)).toContain("albamon:201");expect(result.duplicateGroups).toEqual([{representativeId:"jobkorea:102",totalItems:2,hasUserState:true}]);const details=getDuplicateJobGroup({page:1,pageSize:50,filters:{...DEFAULT_FILTERS,salaryThresholds:{...DEFAULT_FILTERS.salaryThresholds}},sort:"newest",workspaceView:"all"},"jobkorea:102",current.path,new Date("2026-08-07T12:00:00+09:00"));expect(details.members.map(item=>item.job.id)).toEqual(["jobkorea:101"]);expect(details.userStates[0]).toMatchObject({jobId:"jobkorea:101",isFavorite:true,note:"secondary state"});expect(Number((current.database.prepare("SELECT COUNT(*) count FROM jobs").get() as {count:number}).count)).toBe(before);});
  it("applies filters before grouping and paginates display groups",()=>{seedDuplicateContract();const seoul=query({filters:{...DEFAULT_FILTERS,region:"seoul"},pageSize:25});expect(seoul.pagination.totalItems).toBe(4);expect(seoul.duplicateGroups).toEqual([]);expect(seoul.items).toHaveLength(4);expect(seoul.summary.mapEligible).toBe(0);});
  it("ranks the complete monthly-coordinate universe with the fixed 70/30 score before pagination",()=>{
    test=createTestDatabase();const repository=new JobRepository(test.database);
    const add=(id:string,salary:number,latitude:number)=>repository.upsert(canonicalJob({id:`albamon:${id}`,source:"albamon",sourcePostingId:id,sourceUrl:`https://www.albamon.com/jobs/detail/${id}`,canonicalUrl:`https://www.albamon.com/jobs/detail/${id}`,title:`공고 ${id}`,companyName:`회사 ${id}`,normalizedCompanyName:`회사 ${id}`,latitude,longitude:127,salary:{...canonicalJob().salary,type:"monthly",originalText:`${salary}원`,minimumAmount:salary,maximumAmount:salary}}),{recordKind:"live_one_shot_observation",evidenceType:"public_page_observation",sourceFixtureReference:"monthly-distance",mapPosition:{latitude,longitude:127,kind:"exact",provenance:"source"},observationKind:"bounded_listing_collection",normalizedRegions:["seoul"],regionConfidence:"mapped_city",regionEvidenceSource:"displayed_location"});
    add("1",3_000_000,37.5);add("2",4_000_000,37.55);add("3",5_000_000,37.9);
    const result=query({sort:"monthly_distance",pageSize:25,origin:{latitude:37.5,longitude:127}});
    expect(result.pagination.totalItems).toBe(3);expect(result.monthlyDistanceRankings).toHaveLength(3);
    expect(result.monthlyDistanceRankings![0]!.combinedScore).toBeGreaterThan(result.monthlyDistanceRankings![1]!.combinedScore);
    expect(result.items.map(item=>item.job.id)).toEqual(result.monthlyDistanceRankings!.map(item=>item.jobId));
  });
  it("requires an origin and applies maximum distance before monthly scoring",()=>{seed();expect(()=>query({sort:"monthly_distance"})).toThrow("ORIGIN_REQUIRED");const current=test!;current.database.prepare("UPDATE jobs SET display_map_latitude=37.5,display_map_longitude=127,display_map_kind='exact',display_map_provenance='source' WHERE id='jobkorea:1'").run();const result=query({sort:"monthly_distance",origin:{latitude:37.5,longitude:127},filters:{...DEFAULT_FILTERS,maxDistanceKm:1}});expect(result.items.map(item=>item.job.id)).toEqual(["jobkorea:1"]);});

  it("loads 244 server-side personal exclusions and matches title or company case-insensitively",()=>{
    seed();const keywords=["특별","회사 2",...Array.from({length:242},(_,index)=>`필터${index}`)];
    const result=queryPersonal(keywords);
    expect(result.personalExclusions).toEqual({applied:true,count:244});
    expect(result.items.some(item=>item.job.title==="특별 검색 공고")).toBe(false);
    expect(result.items.some(item=>item.job.companyName.toLocaleLowerCase("en-US").includes("회사 2"))).toBe(false);
  });

  it("applies the source-neutral personal profile before grouping and pagination",()=>{
    seedDuplicateContract();
    const raw=query();
    const filtered=queryPersonal(["백엔드"]);
    expect(raw.pagination.totalItems).toBe(4);
    expect(filtered.pagination.totalItems).toBe(1);
    expect(filtered.duplicateGroups).toEqual([]);
    expect(filtered.items.every(item=>!item.job.title.includes("백엔드"))).toBe(true);
  });

  it("recalculates the monthly-distance universe after excluded jobs are removed",()=>{
    test=createTestDatabase();const repository=new JobRepository(test.database);
    const add=(id:string,salary:number,latitude:number,companyName:string)=>repository.upsert(canonicalJob({id:`albamon:${id}`,source:"albamon",sourcePostingId:id,sourceUrl:`https://www.albamon.com/jobs/detail/${id}`,canonicalUrl:`https://www.albamon.com/jobs/detail/${id}`,title:`월급 공고 ${id}`,companyName,normalizedCompanyName:companyName,latitude,longitude:127,salary:{...canonicalJob().salary,type:"monthly",originalText:`${salary}원`,minimumAmount:salary,maximumAmount:salary}}),{recordKind:"live_one_shot_observation",evidenceType:"public_page_observation",sourceFixtureReference:"personal-exclusion-ranking",mapPosition:{latitude,longitude:127,kind:"exact",provenance:"source"},observationKind:"bounded_listing_collection",normalizedRegions:["seoul"],regionConfidence:"mapped_city",regionEvidenceSource:"displayed_location"});
    add("1",3_000_000,37.5,"일반 회사");add("2",4_000_000,37.55,"일반 회사 2");add("3",5_000_000,37.9,"제외 회사");
    const raw=query({sort:"monthly_distance",pageSize:25,origin:{latitude:37.5,longitude:127}});
    const filtered=queryPersonal(["제외"],{sort:"monthly_distance",pageSize:25,origin:{latitude:37.5,longitude:127}});
    expect(filtered.items.map(item=>item.job.id)).not.toContain("albamon:3");
    expect(filtered.pagination.totalItems).toBe(2);
    const rawSecond=raw.monthlyDistanceRankings!.find(item=>item.jobId==="albamon:2")!;
    const filteredSecond=filtered.monthlyDistanceRankings!.find(item=>item.jobId==="albamon:2")!;
    expect(filteredSecond.combinedScore).toBeGreaterThan(rawSecond.combinedScore);
  });

  it("returns the raw universe when the personal exclusion toggle is off",()=>{
    seed();const result=getJobsPage({page:1,pageSize:50,filters:{...DEFAULT_FILTERS,salaryThresholds:{...DEFAULT_FILTERS.salaryThresholds}},sort:"newest",workspaceView:"all",applyPersonalExclusions:false},test!.path,new Date("2026-08-07T12:00:00+09:00"),{loadPersonalProfile:()=>personalState(["특별"])});
    expect(result.personalExclusions).toEqual({applied:false,count:1});
    expect(result.pagination.totalItems).toBe(130);
    expect(result.items.some(item=>item.job.title==="특별 검색 공고")).toBe(true);
  });
});
