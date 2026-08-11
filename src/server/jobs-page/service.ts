import "server-only";
import type Database from "better-sqlite3";
import { openReadonlyDatabase } from "../../db/connection";
import { JobRepository } from "../../db/repositories/job-repository";
import { daysSince, type JobFreshness } from "../../services/job-freshness";
import type { JobUserState } from "../../services/job-user-state";
import { normalizeCollectionExclusionConfig, normalizeExclusionText, normalizeImportedCollectionExclusionConfig } from "../../services/collection-exclusion";
import type { JobFilterState, SortOption } from "../../domain/ui-job";
import { validateJobsPageRequest, type DuplicateJobGroupDetails, type JobsFacetSummary, type JobsPageRequest, type JobsPageResult } from "./contracts";
import { semanticJobGroupKey } from "../../services/semantic-job-group";
import { getPersonalAlbamonProfile, type PersonalAlbamonProfileState } from "../personal-albamon-profile/service";
import { getJobsDatabasePath } from "../runtime/public-demo-database";

type Parameters = Array<string | number>;
type Row = Record<string, unknown>;
const KOREA_TIME_ZONE = "Asia/Seoul";
const exactLocations = ["exact_coordinate", "exact_address"];
const estimatedLocations = ["neighborhood", "district", "city", "station_area"];

const koreaDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const add = (where: string[], parameters: Parameters, sql: string, ...values: Parameters) => { where.push(sql); parameters.push(...values); };

function buildWhere(filters: JobFilterState, workspaceView: JobsPageRequest["workspaceView"], now: Date, sort: SortOption,
  origin?: JobsPageRequest["origin"], personalExclusions: readonly string[] = []) {
  const where: string[] = [];
  const parameters: Parameters = [];
  if (process.env.NEARBY_JOBS_REAL_USE_MODE === "1") add(where, parameters, "j.provenance_kind = ?", "live_one_shot_observation");
  if (!filters.showDemo) add(where, parameters, "j.is_fictional = 0");
  if (filters.source !== "all") add(where, parameters, "j.source = ?", filters.source);
  if (filters.provenance === "manual") add(where, parameters, "j.observation_kind IN ('bounded_manual_collection','bounded_listing_collection')");
  if (filters.provenance === "fixture") add(where, parameters, "j.provenance_kind = 'fixture_derived'");
  if (filters.provenance === "demo") add(where, parameters, "j.is_fictional = 1");
  if (filters.completeness === "listing_only") add(where, parameters, "j.observation_kind = 'bounded_listing_collection'");
  if (filters.completeness === "detail_complete") add(where, parameters, "j.observation_kind = 'bounded_manual_collection'");
  if (["seoul", "gyeonggi", "capital_scope"].includes(filters.region)) add(where, parameters, "EXISTS (SELECT 1 FROM json_each(j.normalized_regions_json) WHERE value = ?)", filters.region);
  if (filters.region === "other") add(where, parameters, "EXISTS (SELECT 1 FROM json_each(j.normalized_regions_json) WHERE value IN ('other','incheon'))");
  if (filters.region === "unknown") add(where, parameters, "json_array_length(j.normalized_regions_json) = 0");
  if (personalExclusions.length) add(where, parameters, "jobs_personal_excluded(j.title,j.company_name)=0");
  const mapSql = "j.display_map_latitude IS NOT NULL AND j.display_map_longitude IS NOT NULL AND j.display_map_kind IS NOT NULL";
  if (filters.mapEligibility === "map") add(where, parameters, mapSql);
  if (filters.mapEligibility === "list_only") add(where, parameters, `NOT (${mapSql})`);
  if ((filters.maxDistanceKm > 0 || sort === "monthly_distance") && !origin) throw new Error("ORIGIN_REQUIRED");
  if (filters.maxDistanceKm > 0) add(where, parameters,
    "jobs_distance_km(j.display_map_latitude,j.display_map_longitude,?,?) <= ?", origin!.latitude, origin!.longitude, filters.maxDistanceKm);
  if (sort === "monthly_distance") add(where, parameters,
    "j.salary_type='monthly' AND j.salary_minimum_amount IS NOT NULL AND j.display_map_latitude IS NOT NULL AND j.display_map_longitude IS NOT NULL");
  if (filters.city) add(where, parameters, "j.city = ?", filters.city);
  if (filters.district) add(where, parameters, "j.district = ?", filters.district);
  if (filters.category) add(where, parameters, "EXISTS (SELECT 1 FROM job_categories c WHERE c.job_id=j.id AND c.category=?)", filters.category);
  if (filters.employmentType) add(where, parameters, "EXISTS (SELECT 1 FROM job_employment_types e WHERE e.job_id=j.id AND e.employment_type=?)", filters.employmentType);
  if (filters.experienceRequirement) add(where, parameters, "j.experience_requirement = ?", filters.experienceRequirement);
  if (filters.educationRequirement) add(where, parameters, "j.education_requirement = ?", filters.educationRequirement);
  if (filters.salaryType !== "all") add(where, parameters, "j.salary_type = ?", filters.salaryType);
  if (filters.postingStatus !== "all") add(where, parameters, "j.posting_status = ?", filters.postingStatus);
  if (filters.locationAccuracy !== "all") add(where, parameters, "j.location_accuracy = ?", filters.locationAccuracy);
  if (filters.locationMode === "exact") add(where, parameters, `j.location_accuracy IN (${exactLocations.map(() => "?").join(",")})`, ...exactLocations);
  if (filters.locationMode === "estimated") add(where, parameters, `j.location_accuracy IN (${estimatedLocations.map(() => "?").join(",")})`, ...estimatedLocations);
  const thresholds = filters.salaryThresholds;
  if (thresholds.normalizedMonthly > 0) add(where, parameters, "j.salary_normalized_monthly_minimum >= ?", thresholds.normalizedMonthly);
  if (filters.salaryType !== "all") {
    const threshold = { hourly: thresholds.hourly, daily: thresholds.daily, monthly: thresholds.monthly, annual: thresholds.annual }[filters.salaryType as "hourly" | "daily" | "monthly" | "annual"] ?? 0;
    if (threshold > 0) add(where, parameters, "j.salary_minimum_amount >= ?", threshold);
  } else {
    const active = (["hourly", "daily", "monthly", "annual"] as const).filter((type) => thresholds[type] > 0);
    if (active.length) {
      const parts = active.map(() => "(j.salary_type=? AND j.salary_minimum_amount>=?)");
      add(where, parameters, `(${parts.join(" OR ")})`, ...active.flatMap((type) => [type, thresholds[type]]));
    }
  }
  if (filters.deadline === "no_deadline") add(where, parameters, "j.expires_at IS NULL");
  if (filters.deadline === "within_3_days" || filters.deadline === "within_7_days") {
    const until = new Date(now.getTime() + (filters.deadline === "within_3_days" ? 3 : 7) * 86_400_000).toISOString();
    add(where, parameters, "j.expires_at IS NOT NULL AND j.expires_at >= ? AND j.expires_at <= ?", now.toISOString(), until);
  }
  const localDate = koreaDate(now);
  if (filters.discoveryDate === "today_posted") add(where, parameters, "j.posting_date_status='today' AND j.posting_date_local_date=?", localDate);
  if (filters.discoveryDate === "today_first_seen") add(where, parameters, "date(j.created_at, '+9 hours')=?", localDate);
  const query = filters.keyword.trim().toLocaleLowerCase("ko");
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    add(where, parameters, `(lower(j.title) LIKE ? ESCAPE '\\' OR lower(j.company_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(j.address_original_text,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(j.city,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(j.district,'')) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM job_categories c WHERE c.job_id=j.id AND lower(c.category) LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM job_employment_types e WHERE e.job_id=j.id AND lower(e.employment_type) LIKE ? ESCAPE '\\'))`, like, like, like, like, like, like, like);
  }
  try {
    const exclusion = normalizeCollectionExclusionConfig({ keywords: filters.exclusionKeywords, fields: filters.exclusionFields });
    for (const keyword of exclusion.keywords) {
      const like = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;
      const parts: string[] = [];
      const values: Parameters = [];
      if (exclusion.fields.includes("title")) { parts.push("lower(j.title) LIKE ? ESCAPE '\\'"); values.push(like); }
      if (exclusion.fields.includes("company")) { parts.push("lower(j.company_name) LIKE ? ESCAPE '\\'"); values.push(like); }
      if (exclusion.fields.includes("location")) { parts.push("lower(COALESCE(j.address_original_text,'')) LIKE ? ESCAPE '\\'"); values.push(like); }
      if (exclusion.fields.includes("category")) { parts.push("EXISTS (SELECT 1 FROM job_categories c WHERE c.job_id=j.id AND lower(c.category) LIKE ? ESCAPE '\\')"); values.push(like); }
      if (exclusion.fields.includes("employment_type")) { parts.push("EXISTS (SELECT 1 FROM job_employment_types e WHERE e.job_id=j.id AND lower(e.employment_type) LIKE ? ESCAPE '\\')"); values.push(like); }
      if (exclusion.fields.includes("work_schedule")) { parts.push("lower(COALESCE(j.work_days_original_text,'') || ' ' || COALESCE(j.work_start_time,'') || ' ' || COALESCE(j.work_end_time,'')) LIKE ? ESCAPE '\\'"); values.push(like); }
      if (parts.length) add(where, parameters, `NOT (${parts.join(" OR ")})`, ...values);
    }
  } catch { add(where, parameters, "1=1"); }
  if (workspaceView === "hidden") add(where, parameters, "COALESCE(s.is_hidden,0)=1");
  else {
    add(where, parameters, "COALESCE(s.is_hidden,0)=0");
    if (workspaceView === "archived") add(where, parameters, "COALESCE(s.is_archived,0)=1");
    else {
      add(where, parameters, "COALESCE(s.is_archived,0)=0");
      if (workspaceView === "favorite") add(where, parameters, "COALESCE(s.is_favorite,0)=1");
      else if (workspaceView !== "all") add(where, parameters, "COALESCE(s.workflow_status,'unreviewed')=?", workspaceView);
    }
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", parameters, localDate };
}

interface GroupRow extends Row { id:string;source:string;source_posting_id:string;company_name:string;normalized_company_name:string;title:string;posting_date_status:string|null;posting_date_local_date:string|null;posted_at:string|null;created_at:string;expires_at:string|null;display_map_latitude:number|null;display_map_longitude:number|null;location_accuracy:string;posting_status:string;salary_type:string;salary_minimum_amount:number|null;salary_maximum_amount:number|null;salary_normalized_monthly_maximum:number|null;has_user_state:number;semanticKey:string;distanceKm:number|null;combinedScore:number|null }
const compareNullable=(left:string|number|null,right:string|number|null,direction:"asc"|"desc")=>left===right?0:left===null?1:right===null?-1:(left<right?-1:1)*(direction==="asc"?1:-1);
const stableCompare=(left:GroupRow,right:GroupRow)=>left.source.localeCompare(right.source)||left.source_posting_id.localeCompare(right.source_posting_id,undefined,{numeric:true});
function compareNewest(left:GroupRow,right:GroupRow){return Number(left.posting_date_status!=="today")-Number(right.posting_date_status!=="today")||compareNullable(left.posting_date_local_date,right.posting_date_local_date,"desc")||compareNullable(left.posted_at,right.posted_at,"desc")||compareNullable(left.created_at,right.created_at,"desc")||stableCompare(left,right);}
function compareGroupRows(left:GroupRow,right:GroupRow,sort:SortOption,origin:{latitude:number;longitude:number}){
  const salary=(row:GroupRow,type:string)=>row.salary_type===type?row.salary_maximum_amount:null;
  const distance=(row:GroupRow)=>{if(row.display_map_latitude===null||row.display_map_longitude===null)return null;const radians=(value:number)=>value*Math.PI/180;const dLat=radians(row.display_map_latitude-origin.latitude),dLon=radians(row.display_map_longitude-origin.longitude);const a=Math.sin(dLat/2)**2+Math.cos(radians(origin.latitude))*Math.cos(radians(row.display_map_latitude))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};
  let result:number;
  if(sort==="newest")return compareNewest(left,right);
  if(sort==="monthly_distance")result=compareNullable(left.combinedScore,right.combinedScore,"desc")
    ||compareNullable(left.salary_minimum_amount,right.salary_minimum_amount,"desc")
    ||compareNullable(left.distanceKm,right.distanceKm,"asc")||compareNewest(left,right);
  else if(sort==="deadline")result=compareNullable(left.expires_at,right.expires_at,"asc");
  else if(sort==="distance")result=compareNullable(distance(left),distance(right),"asc");
  else if(["hourly","daily","monthly","annual"].includes(sort))result=compareNullable(salary(left,sort),salary(right,sort),"desc");
  else if(sort==="normalized_monthly")result=compareNullable(left.salary_normalized_monthly_maximum,right.salary_normalized_monthly_maximum,"desc");
  else result=left.company_name.localeCompare(right.company_name,"ko");
  return result||stableCompare(left,right);
}

function filteredGroupRows(db:Database.Database,where:ReturnType<typeof buildWhere>){
  const rows=db.prepare(`SELECT j.id,j.source,j.source_posting_id,j.company_name,j.normalized_company_name,j.title,j.posting_date_status,j.posting_date_local_date,j.posted_at,j.created_at,j.expires_at,j.display_map_latitude,j.display_map_longitude,j.location_accuracy,j.posting_status,j.salary_type,j.salary_minimum_amount,j.salary_maximum_amount,j.salary_normalized_monthly_maximum,CASE WHEN s.job_id IS NULL THEN 0 ELSE 1 END has_user_state FROM jobs j LEFT JOIN job_user_state s ON s.job_id=j.id ${where.sql}`).all(...where.parameters) as GroupRow[];
  for(const row of rows){row.semanticKey=semanticJobGroupKey(row.normalized_company_name||row.company_name,row.title);row.distanceKm=null;row.combinedScore=null;}
  return rows;
}

function scoreMonthlyDistance(rows:GroupRow[],origin:{latitude:number;longitude:number},distanceCeiling:number):void{
  const eligible=rows.filter((row):row is GroupRow&{salary_minimum_amount:number;display_map_latitude:number;display_map_longitude:number}=>
    row.salary_type==="monthly"&&row.salary_minimum_amount!==null&&row.display_map_latitude!==null&&row.display_map_longitude!==null);
  if(!eligible.length)return;
  const salaries=eligible.map(({salary_minimum_amount})=>salary_minimum_amount);const minimum=Math.min(...salaries),maximum=Math.max(...salaries);
  const radians=(value:number)=>value*Math.PI/180;
  for(const row of eligible){const dLat=radians(row.display_map_latitude-origin.latitude),dLon=radians(row.display_map_longitude-origin.longitude);
    const a=Math.sin(dLat/2)**2+Math.cos(radians(origin.latitude))*Math.cos(radians(row.display_map_latitude))*Math.sin(dLon/2)**2;
    row.distanceKm=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    const salaryScore=maximum===minimum?100:Math.max(0,Math.min(100,100*(row.salary_minimum_amount-minimum)/(maximum-minimum)));
    const distanceScore=Math.max(0,Math.min(100,100*(1-Math.min(row.distanceKm,distanceCeiling)/distanceCeiling)));
    row.combinedScore=salaryScore*0.7+distanceScore*0.3;
  }
}

function listValues(db: Database.Database, table: string, column: string) {
  const allowed = new Set(["job_categories:category", "job_employment_types:employment_type"]);
  if (!allowed.has(`${table}:${column}`)) throw new Error("INVALID_FACET");
  return (db.prepare(`SELECT DISTINCT ${column} value FROM ${table} WHERE ${column}<>'' ORDER BY ${column}`).all() as Array<{ value: string }>).map(({ value }) => value);
}

function facets(db: Database.Database): JobsFacetSummary {
  const base = process.env.NEARBY_JOBS_REAL_USE_MODE === "1" ? " WHERE provenance_kind='live_one_shot_observation'" : "";
  const rows = db.prepare(`SELECT COUNT(*) total, SUM(source='jobkorea') jobkorea, SUM(source='albamon') albamon, SUM(is_fictional=1) demo, SUM(provenance_kind='fixture_derived') fixture, SUM(observation_kind IN ('bounded_manual_collection','bounded_listing_collection')) manual, SUM(observation_kind='bounded_listing_collection') listingOnly, SUM(observation_kind='bounded_manual_collection') detailComplete, SUM(display_map_latitude IS NOT NULL AND display_map_longitude IS NOT NULL) mapEligible, SUM(EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value='seoul')) seoul, SUM(EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value='gyeonggi')) gyeonggi, SUM(EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value='capital_scope')) capitalScope, SUM(json_array_length(normalized_regions_json)=0) unknownRegion, SUM(EXISTS(SELECT 1 FROM json_each(normalized_regions_json) WHERE value IN ('other','incheon'))) otherRegion FROM jobs${base}`).get() as Row;
  const distinct = (column: string) => (db.prepare(`SELECT DISTINCT ${column} value FROM jobs${base}${base ? " AND" : " WHERE"} ${column} IS NOT NULL AND ${column}<>'' ORDER BY ${column}`).all() as Array<{ value: string }>).map(({ value }) => value);
  return { total: Number(rows.total), sources: { jobkorea: Number(rows.jobkorea), albamon: Number(rows.albamon) }, provenance: { manual: Number(rows.manual), fixture: Number(rows.fixture), demo: Number(rows.demo) }, completeness: { listing_only: Number(rows.listingOnly), detail_complete: Number(rows.detailComplete) }, regions: { seoul: Number(rows.seoul), gyeonggi: Number(rows.gyeonggi), capital_scope: Number(rows.capitalScope), other: Number(rows.otherRegion), unknown: Number(rows.unknownRegion) }, mapEligible: Number(rows.mapEligible), cities: distinct("city"), districts: distinct("district"), categories: listValues(db,"job_categories","category"), employmentTypes: listValues(db,"job_employment_types","employment_type"), experienceRequirements: distinct("experience_requirement"), educationRequirements: distinct("education_requirement") };
}

function userStates(db: Database.Database, ids: string[]): JobUserState[] {
  if (!ids.length) return [];
  const statement = db.prepare("SELECT * FROM job_user_state WHERE job_id=?");
  return ids.flatMap((id) => { const r = statement.get(id) as Row | undefined; return r ? [{ jobId:id,isFavorite:Boolean(r.is_favorite),workflowStatus:String(r.workflow_status) as JobUserState["workflowStatus"],isHidden:Boolean(r.is_hidden),isArchived:Boolean(r.is_archived),note:String(r.note),applicationDate:r.application_date as string|null,followUpAt:r.follow_up_at as string|null,personalDeadline:r.personal_deadline as string|null,createdAt:String(r.created_at),updatedAt:String(r.updated_at)}] : []; });
}

function freshness(db: Database.Database, ids: string[], now: Date): JobFreshness[] {
  if (!ids.length) return [];
  const statement = db.prepare("SELECT MIN(o.observed_at) first_seen,MAX(o.observed_at) last_seen,COUNT(DISTINCT o.id) observation_count,MAX(c.changed_at) last_changed FROM job_observations o LEFT JOIN job_change_events c ON c.job_id=o.job_id WHERE o.job_id=?");
  return ids.flatMap((jobId) => { const r=statement.get(jobId) as Row; if (!r.first_seen) return []; return [{jobId,firstSeen:String(r.first_seen),lastSeen:String(r.last_seen),lastChanged:typeof r.last_changed==="string"?r.last_changed:null,observationCount:Number(r.observation_count),daysSinceLastSeen:daysSince(String(r.last_seen),now),changedSincePrevious:r.last_changed!==null}]; });
}

export interface JobsPageDependencies { loadPersonalProfile?: () => PersonalAlbamonProfileState }

function resolvePersonalExclusions(request: JobsPageRequest, dependencies: JobsPageDependencies) {
  if (request.applyPersonalExclusions === undefined) return { applied: false, count: 0, keywords: [] as string[] };
  const state = (dependencies.loadPersonalProfile ?? getPersonalAlbamonProfile)();
  if (!state.configured || !state.profile) return { applied: false, count: 0, keywords: [] as string[] };
  const normalized = normalizeImportedCollectionExclusionConfig({ keywords: state.profile.albamon.exclusions,
    fields: ["title", "company"] });
  return { applied: request.applyPersonalExclusions, count: normalized.keywords.length,
    keywords: request.applyPersonalExclusions ? normalized.keywords : [] };
}

function registerPersonalExclusionFunction(db: Database.Database, keywords: readonly string[]) {
  if (!keywords.length) return;
  const literalPattern = new RegExp(keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "u");
  db.function("jobs_personal_excluded", { deterministic: true }, (title: unknown, company: unknown) => {
    const normalizedTitle = normalizeExclusionText(typeof title === "string" ? title : "");
    const normalizedCompany = normalizeExclusionText(typeof company === "string" ? company : "");
    return literalPattern.test(normalizedTitle) || literalPattern.test(normalizedCompany) ? 1 : 0;
  });
}

export function getJobsPage(raw: JobsPageRequest, path?: string, now = new Date(), dependencies: JobsPageDependencies = {}): JobsPageResult {
  const request = validateJobsPageRequest(raw);
  const personalExclusions = resolvePersonalExclusions(request, dependencies);
  const db = openReadonlyDatabase(getJobsDatabasePath(path));
  try {
    db.function("jobs_distance_km",{deterministic:true},(latitude:unknown,longitude:unknown,originLatitude:unknown,originLongitude:unknown)=>{
      if(typeof latitude!=="number"||typeof longitude!=="number"||typeof originLatitude!=="number"||typeof originLongitude!=="number")return null;
      const radians=(value:number)=>value*Math.PI/180;
      const dLat=radians(latitude-originLatitude),dLon=radians(longitude-originLongitude);
      const a=Math.sin(dLat/2)**2+Math.cos(radians(originLatitude))*Math.cos(radians(latitude))*Math.sin(dLon/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    });
    registerPersonalExclusionFunction(db,personalExclusions.keywords);
    const where = buildWhere(request.filters, request.workspaceView, now, request.sort, request.origin, personalExclusions.keywords);
    const filteredRows=filteredGroupRows(db,where);const groups=new Map<string,GroupRow[]>();for(const row of filteredRows){const key=`${row.source}\u0000${row.semanticKey}`;const group=groups.get(key);if(group)group.push(row);else groups.set(key,[row]);}
    const origin=request.origin??{latitude:37.5665,longitude:126.978};
    if(request.sort==="monthly_distance")scoreMonthlyDistance(filteredRows,origin,request.filters.maxDistanceKm>0?request.filters.maxDistanceKm:50);
    for(const group of groups.values())group.sort(request.sort==="monthly_distance"?(left,right)=>compareGroupRows(left,right,request.sort,origin):compareNewest);
    const representatives=[...groups.values()].map(group=>group[0]!).sort((left,right)=>compareGroupRows(left,right,request.sort,origin));
    const totalItems=representatives.length;
    const totalPages = Math.max(1, Math.ceil(totalItems/request.pageSize));
    const page = Math.min(request.page,totalPages);
    const offset=(page-1)*request.pageSize;
    const pageRepresentatives=representatives.slice(offset,offset+request.pageSize);const ids=pageRepresentatives.map(({id})=>id);
    const repository = new JobRepository(db);
    const hydrated=repository.listUiRecordsByIds(ids);
    const duplicateGroups=pageRepresentatives.flatMap(representative=>{const group=groups.get(`${representative.source}\u0000${representative.semanticKey}`)!;return group.length>1?[{representativeId:representative.id,totalItems:group.length,hasUserState:group.some(row=>Boolean(row.has_user_state))}]:[];});
    const allFacets=facets(db);
    return { items: hydrated.records, userStates:userStates(db,ids), freshness:freshness(db,ids,now), duplicateGroups,
      monthlyDistanceRankings:pageRepresentatives.flatMap(row=>row.combinedScore!==null&&row.distanceKm!==null&&row.salary_minimum_amount!==null?[{jobId:row.id,monthlyComparable:row.salary_minimum_amount,distanceKm:row.distanceKm,combinedScore:row.combinedScore}]:[]),
      pagination:{page,pageSize:request.pageSize,totalItems,totalPages,hasPrevious:page>1,hasNext:page<totalPages}, summary:{total:allFacets.total,filtered:totalItems,exact:representatives.filter(row=>exactLocations.includes(row.location_accuracy)).length,todayOrClosing:representatives.filter(row=>row.posting_date_local_date===where.localDate||row.posting_status==="closing_soon").length,jobKorea:representatives.filter(row=>row.source==="jobkorea").length,albamon:representatives.filter(row=>row.source==="albamon").length,mapEligible:representatives.filter(row=>row.display_map_latitude!==null&&row.display_map_longitude!==null).length}, facets:allFacets, diagnostics:hydrated.diagnostics,
      personalExclusions: { applied: personalExclusions.applied, count: personalExclusions.count } };
  } finally { db.close(); }
}

export function getDuplicateJobGroup(raw: JobsPageRequest, representativeId: string, path?: string, now=new Date(), dependencies: JobsPageDependencies = {}): DuplicateJobGroupDetails {
  const request=validateJobsPageRequest(raw);if(!representativeId||representativeId.length>200)throw new Error("INVALID_REPRESENTATIVE_ID");
  const personalExclusions=resolvePersonalExclusions(request,dependencies);
  const db=openReadonlyDatabase(getJobsDatabasePath(path));
  try{
    registerPersonalExclusionFunction(db,personalExclusions.keywords);
    const where=buildWhere(request.filters,request.workspaceView,now,request.sort,request.origin,personalExclusions.keywords);const rows=filteredGroupRows(db,where);const origin=request.origin??{latitude:37.5665,longitude:126.978};if(request.sort==="monthly_distance")scoreMonthlyDistance(rows,origin,request.filters.maxDistanceKm>0?request.filters.maxDistanceKm:50);const representative=rows.find(row=>row.id===representativeId);
    if(!representative)return{representativeId,members:[],userStates:[],freshness:[]};
    const ids=rows.filter(row=>row.source===representative.source&&row.semanticKey===representative.semanticKey).sort(request.sort==="monthly_distance"?(left,right)=>compareGroupRows(left,right,request.sort,origin):compareNewest).slice(0,500).map(({id})=>id).filter(id=>id!==representativeId);const hydrated=new JobRepository(db).listUiRecordsByIds(ids);
    return{representativeId,members:hydrated.records,userStates:userStates(db,ids),freshness:freshness(db,ids,now)};
  }finally{db.close();}
}
