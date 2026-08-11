"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobFilterState, SavedPreferences, SortOption, UserJobStatus, UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { createPreferencesRepository, DEFAULT_PREFERENCES } from "../../repositories/preferences-repository";
import { countActiveFilters, DEFAULT_FILTERS, isMapEligible, reconcileSelectedJobId } from "../../services/job-search";
import { FilterPanel } from "../filters/FilterPanel";
import { AppHeader } from "../header/AppHeader";
import { JobList } from "../jobs/JobList";
import { MapPanel } from "../map/MapPanel";
import { SummaryStrip } from "../summary/SummaryStrip";
import { FirstRunOnboarding } from "../onboarding/FirstRunOnboarding";
import { defaultJobUserState,type JobUserState,type JobUserStateInput } from "../../services/job-user-state";
import type{JobFreshness}from"../../services/job-freshness";
import {SavedViewsBar} from "../saved-views/SavedViewsBar";
import type { LocalReadiness } from "../../services/local-readiness";
import type { JobsPageResult, WorkspaceView } from "../../server/jobs-page/contracts";

interface NearbyJobsDashboardProps { initialPage?: JobsPageResult; initialJobs?: UiJobRecord[]; readiness?: LocalReadiness; dataError?: string; dataWarning?: string | undefined }

const legacyPage=(items:UiJobRecord[]):JobsPageResult=>({items,userStates:[],freshness:[],duplicateGroups:[],monthlyDistanceRankings:[],pagination:{page:1,pageSize:50,totalItems:items.length,totalPages:1,hasPrevious:false,hasNext:false},summary:{total:items.length,filtered:items.length,exact:0,todayOrClosing:0,jobKorea:items.filter(r=>r.job.source==="jobkorea").length,albamon:items.filter(r=>r.job.source==="albamon").length,mapEligible:items.filter(isMapEligible).length},facets:{total:items.length,sources:{jobkorea:items.filter(r=>r.job.source==="jobkorea").length,albamon:items.filter(r=>r.job.source==="albamon").length},provenance:{manual:0,fixture:0,demo:items.filter(r=>r.isFictional).length},completeness:{listing_only:0,detail_complete:0},regions:{},mapEligible:items.filter(isMapEligible).length,cities:[],districts:[],categories:[],employmentTypes:[],experienceRequirements:[],educationRequirements:[]},diagnostics:[]});

export function NearbyJobsDashboard({ initialPage, initialJobs = [], readiness = {version:"0.1.1",databaseReady:true,migrationsReady:true,chromiumReady:false,collectionUiEnabled:false,localhostSafe:true,latestBackupAvailable:false}, dataError, dataWarning }: NearbyJobsDashboardProps) {
  const startingPage=initialPage??legacyPage(initialJobs);
  const [filters, setFilters] = useState<JobFilterState>(DEFAULT_PREFERENCES.filters);
  const [sort, setSort] = useState<SortOption>(DEFAULT_PREFERENCES.sort);
  const [mapVisible, setMapVisible] = useState(DEFAULT_PREFERENCES.mapVisible);
  const [origin, setOrigin] = useState<UserOrigin>(DEFAULT_PREFERENCES.origin);
  const [userStatuses, setUserStatuses] = useState<Record<string, UserJobStatus>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [isSinglePane, setIsSinglePane] = useState<boolean | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const [corruptedSettings, setCorruptedSettings] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [jobStates,setJobStates]=useState<Record<string,JobUserState>>({});
  const [workspaceView,setWorkspaceView]=useState<WorkspaceView>("all");
  const [pageResult,setPageResult]=useState(startingPage);
  const [page,setPage]=useState(startingPage.pagination.page);
  const [pageSize,setPageSize]=useState(startingPage.pagination.pageSize);
  const[freshness,setFreshness]=useState<Record<string,JobFreshness>>({});
  const [requestError,setRequestError]=useState<string|null>(null);
  const [jobStateError,setJobStateError]=useState<string|null>(null);
  const [isLoading,setIsLoading]=useState(false);
  const [refreshVersion,setRefreshVersion]=useState(0);
  const [applyPersonalExclusions,setApplyPersonalExclusions]=useState(startingPage.personalExclusions?.applied??false);
  const [personalExclusionCount,setPersonalExclusionCount]=useState(startingPage.personalExclusions?.count??0);
  const searchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const requestId=useRef(0);
  const pendingJobStateSaves=useRef(new Set<string>());
  const initialRequest=useRef(true);
  const hasOneShotObservation = pageResult.items.some(({ provenanceKind }) => provenanceKind === "live_one_shot_observation") || pageResult.facets.total > (pageResult.facets.provenance.fixture??0)+(pageResult.facets.provenance.demo??0);
  const listPanelRef = useRef<HTMLElement>(null);
  const mapSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const result = createPreferencesRepository(window.localStorage).load();
    const params=new URLSearchParams(window.location.search);
    const source=params.get("source");const region=params.get("region");const discoveryDate=params.get("discoveryDate");
    setFilters({...result.value.filters,
      ...(source==="jobkorea"||source==="albamon"?{source}:{}),
      ...(["seoul","gyeonggi","capital_scope","other","unknown"].includes(region??"")?{region:region as JobFilterState["region"]}:{}),
      ...(discoveryDate==="today_posted"||discoveryDate==="today_first_seen"?{discoveryDate}:{}),
    });
    const urlSort=params.get("sort") as SortOption|null;
    setSort(urlSort&&["newest","deadline","distance","monthly_distance","hourly","daily","monthly","annual","normalized_monthly","company"].includes(urlSort)?urlSort:result.value.sort);
    const urlPage=Number(params.get("page"));const urlPageSize=Number(params.get("pageSize"));
    if(Number.isInteger(urlPage)&&urlPage>=1)setPage(urlPage);
    if([25,50,100].includes(urlPageSize))setPageSize(urlPageSize);
    setMapVisible(result.value.mapVisible);
    setOrigin(result.value.origin); setUserStatuses(result.value.userJobStatuses); setCorruptedSettings(result.corrupted);
    setHydrated(true);
  }, []);
  useEffect(()=>{
    setJobStates(Object.fromEntries(pageResult.userStates.map(state=>[state.jobId,state])));
    setFreshness(Object.fromEntries(pageResult.freshness.map(row=>[row.jobId,row])));
    if(pageResult.personalExclusions)setPersonalExclusionCount(pageResult.personalExclusions.count);
  },[pageResult.userStates,pageResult.freshness,pageResult.personalExclusions]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsSinglePane(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const value: SavedPreferences = { filters, sort, mapVisible, origin, userJobStatuses: userStatuses };
    setStorageFailed(!createPreferencesRepository(window.localStorage).save(value));
  }, [filters, hydrated, mapVisible, origin, sort, userStatuses]);

  const previousQueryShape=useRef("");
  useEffect(()=>{
    if(!hydrated)return;
    const shape=JSON.stringify({filters,sort,workspaceView,pageSize,applyPersonalExclusions});
    if(previousQueryShape.current&&previousQueryShape.current!==shape)setPage(1);
    previousQueryShape.current=shape;
  },[filters,sort,workspaceView,pageSize,applyPersonalExclusions,hydrated]);

  const lastRequestedKeyword=useRef("");
  useEffect(()=>{
    if(!hydrated)return;
    if(initialRequest.current){initialRequest.current=false;}
    const currentRequest=++requestId.current;
    const execute=()=>{
      setIsLoading(true);
      const body={page,pageSize,filters,sort,workspaceView,applyPersonalExclusions,origin:{latitude:origin.latitude,longitude:origin.longitude}};
      void fetch("/api/jobs",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify(body)})
        .then(async response=>{if(!response.ok)throw new Error("JOBS_PAGE_FAILED");return await response.json() as JobsPageResult;})
        .then(result=>{if(currentRequest!==requestId.current)return;setPageResult(result);setPage(result.pagination.page);setRequestError(null);})
        .catch(()=>{if(currentRequest===requestId.current)setRequestError("공고 목록을 새로 불러오지 못했습니다.");})
        .finally(()=>{if(currentRequest===requestId.current)setIsLoading(false);});
      lastRequestedKeyword.current=filters.keyword;
    };
    const keywordChanged=lastRequestedKeyword.current!==filters.keyword;
    if(searchTimer.current)clearTimeout(searchTimer.current);
    if(keywordChanged)searchTimer.current=setTimeout(execute,300);else execute();
    return()=>{if(searchTimer.current){clearTimeout(searchTimer.current);searchTimer.current=null;}};
  },[page,pageSize,filters,sort,workspaceView,applyPersonalExclusions,origin.latitude,origin.longitude,hydrated,refreshVersion]);

  useEffect(()=>{
    if(!hydrated)return;
    const params=new URLSearchParams(window.location.search);
    params.set("page",String(page));params.set("pageSize",String(pageSize));params.set("sort",sort);
    if(filters.source!=="all")params.set("source",filters.source);else params.delete("source");
    if(filters.region!=="all")params.set("region",filters.region);else params.delete("region");
    if(filters.discoveryDate!=="all")params.set("discoveryDate",filters.discoveryDate);else params.delete("discoveryDate");
    window.history.replaceState(null,"",`${window.location.pathname}?${params.toString()}`);
  },[page,pageSize,sort,filters.source,filters.region,filters.discoveryDate,hydrated]);

  useEffect(()=>{
    const restore=()=>{const params=new URLSearchParams(window.location.search);const restoredPage=Number(params.get("page"));const restoredPageSize=Number(params.get("pageSize"));if(Number.isInteger(restoredPage)&&restoredPage>=1)setPage(restoredPage);if([25,50,100].includes(restoredPageSize))setPageSize(restoredPageSize);setFilters(current=>({...current,source:params.get("source")==="jobkorea"||params.get("source")==="albamon"?params.get("source") as JobFilterState["source"]:"all",region:["seoul","gyeonggi","capital_scope","other","unknown"].includes(params.get("region")??"")?params.get("region") as JobFilterState["region"]:"all",discoveryDate:params.get("discoveryDate")==="today_posted"||params.get("discoveryDate")==="today_first_seen"?params.get("discoveryDate") as JobFilterState["discoveryDate"]:"all"}));};
    window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore);
  },[]);

  const sorted = pageResult.items;
  const visibleIds = useMemo(() => sorted.map(({ job }) => job.id), [sorted]);
  const availableSources = useMemo(() => (["jobkorea","albamon"] as const).filter(source=>(pageResult.facets.sources[source]??0)>0), [pageResult.facets.sources]);
  const mapVisibleCount = useMemo(() => sorted.filter(isMapEligible).length, [sorted]);
  useEffect(() => {
    if (!hydrated) return;
    setSelectedJobId((current) => reconcileSelectedJobId(current, visibleIds));
  }, [hydrated, visibleIds]);

  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const scrollToPanel = (panel: "list" | "map") => {
    window.requestAnimationFrame(() => {
      const target = panel === "list" ? listPanelRef.current : mapSlotRef.current;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    });
  };
  const showMobileView = (view: "list" | "map") => {
    setMobileView(view);
    if (view === "map") setMapVisible(true);
    scrollToPanel(view);
  };
  const focusMapJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setMapFocusRequest((value) => value + 1);
    setMapVisible(true);
    setMobileView("map");
    scrollToPanel("map");
  };
  const toggleMap = () => {
    if (mapVisible) {
      setMapVisible(false);
      setMobileView("list");
      if (isSinglePane) scrollToPanel("list");
      return;
    }
    setMapVisible(true);
    if (isSinglePane) showMobileView("map");
  };
  const updateJobState=async(jobId:string,input:JobUserStateInput)=>{
    if(pendingJobStateSaves.current.has(jobId))return;
    const current=jobStates[jobId]??defaultJobUserState(jobId);
    if(current.isFavorite===input.isFavorite&&current.workflowStatus===input.workflowStatus&&current.isHidden===input.isHidden&&current.isArchived===input.isArchived&&current.note===input.note&&current.applicationDate===input.applicationDate&&current.followUpAt===input.followUpAt&&current.personalDeadline===input.personalDeadline)return;
    pendingJobStateSaves.current.add(jobId);setJobStateError(null);
    try{
      const response=await fetch(`/api/job-user-state/${jobId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
      if(!response.ok){const body=await response.json().catch(()=>null) as {error?:{message?:string}}|null;throw new Error(body?.error?.message??"개인 지원 정보를 저장하지 못했습니다.");}
      const body=await response.json();setJobStates(state=>({...state,[jobId]:body.state}));setRefreshVersion(value=>value+1);
    }catch(error){setJobStateError(error instanceof Error?error.message:"개인 지원 정보를 저장하지 못했습니다.");}
    finally{pendingJobStateSaves.current.delete(jobId);}
  };
  const loadDuplicateGroup=async(representativeId:string)=>{const response=await fetch("/api/jobs/duplicates",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({representativeId,page:1,pageSize,filters,sort,workspaceView,applyPersonalExclusions,origin})});if(!response.ok)throw new Error("DUPLICATE_GROUP_FAILED");return await response.json();};
  const summary = pageResult.summary;

  return (
    <main className="app-shell">
      <AppHeader filters={filters} mapVisible={mapVisible} onFiltersChange={setFilters} onToggleFilters={() => setFiltersOpen(true)}
        onToggleMap={toggleMap} availableSources={availableSources} activeFilterCount={countActiveFilters(filters)} onOpenHelp={()=>setHelpOpen(true)} />
      <FirstRunOnboarding readiness={readiness} forceOpen={helpOpen} onClose={()=>setHelpOpen(false)} />
      <div className="notice-strip">
        <span><strong>{hasOneShotObservation ? "로컬 검증 데이터" : "fixture/demo 모드"}</strong> · {hasOneShotObservation ? "공개 페이지를 제한적으로 1회 확인한 데이터가 포함됩니다. 공식 제휴나 지속적인 실시간 연동이 아니며 원문을 최종 기준으로 확인하세요." : "실시간 수집 없이 정제 fixture와 가상 공고만 표시합니다."}</span>
        <span className="privacy-note">입력한 출발지와 화면 설정은 기본적으로 이 브라우저에만 저장됩니다. 브라우저 저장공간을 지우면 설정이 삭제될 수 있습니다.</span>
      </div>
      {corruptedSettings && <div className="warning-banner" role="alert">저장된 설정을 읽을 수 없어 안전한 기본값으로 초기화했습니다.</div>}
      {storageFailed && <div className="warning-banner" role="alert">브라우저 저장공간에 설정을 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.</div>}
      {dataWarning && <div className="warning-banner" role="status">{dataWarning}</div>}
      <SummaryStrip {...summary} />
      <SavedViewsBar filters={filters} sort={sort} onApply={(nextFilters,nextSort)=>{setFilters(nextFilters);if(nextSort)setSort(nextSort)}} />
      <div className="workspace-quick-filters" aria-label="개인 지원 상태 빠른 보기">{([['all','전체'],['favorite','관심 공고'],['apply_planned','지원 예정'],['applied','지원 완료'],['waiting','연락 대기'],['interview','면접'],['archived','보관됨'],['hidden','숨김']] as const).map(([value,label])=><button key={value} className={workspaceView===value?"active":""} aria-pressed={workspaceView===value} onClick={()=>setWorkspaceView(value)}>{label}</button>)}<label className="checkbox-line personal-exclusion-toggle"><input type="checkbox" checked={applyPersonalExclusions} onChange={event=>setApplyPersonalExclusions(event.target.checked)} />내 제외어 적용 ({personalExclusionCount}개)</label></div>
      <p className="result-count-line" aria-live="polite">전체 {pageResult.pagination.totalItems.toLocaleString("ko-KR")}개 중 {pageResult.pagination.totalItems ? ((pageResult.pagination.page-1)*pageResult.pagination.pageSize+1).toLocaleString("ko-KR") : 0}–{Math.min(pageResult.pagination.page*pageResult.pagination.pageSize,pageResult.pagination.totalItems).toLocaleString("ko-KR")} · 현재 페이지 지도 {mapVisibleCount}개</p>
      {requestError&&<div className="warning-banner" role="alert">{requestError}</div>}
      {jobStateError&&<div className="warning-banner" role="alert">{jobStateError}</div>}
      {isLoading&&<div className="jobs-loading" role="status">공고 목록을 갱신하는 중입니다.</div>}
      {filtersOpen && <FilterPanel filters={filters} facets={pageResult.facets} onChange={setFilters} onClose={closeFilters} />}
      <div className="mobile-view-switch" aria-label="모바일 화면 전환">
        <button type="button" className={mobileView === "list" ? "active" : ""} onClick={() => showMobileView("list")} aria-pressed={mobileView === "list"}>목록</button>
        <button type="button" className={mobileView === "map" ? "active" : ""} onClick={() => showMobileView("map")} aria-pressed={mobileView === "map"}>지도</button>
      </div>
      <p className="sr-only" aria-live="polite">현재 필터 결과 {sorted.length}건</p>
      {dataError ? <div className="state-panel" role="alert"><h2>데이터를 표시할 수 없습니다</h2><p>{dataError}</p></div>
        : pageResult.summary.total === 0 ? <div className="state-panel"><h2>불러온 공고가 없습니다</h2><p>데이터베이스 초기화와 수집 상태를 확인해 주세요.</p></div>
        : <div className={`dashboard-body ${mapVisible ? "" : "map-hidden"}`}>
          <section ref={listPanelRef} className={`list-panel ${mobileView === "map" ? "mobile-hidden" : ""}`} aria-label="통합 공고 목록 패널">
            <JobList records={sorted} selectedJobId={selectedJobId} origin={origin} sort={sort} userStates={jobStates} freshness={freshness} duplicateGroups={pageResult.duplicateGroups}
              monthlyDistanceRankings={pageResult.monthlyDistanceRankings??[]}
              loadDuplicateGroup={loadDuplicateGroup}
              pagination={pageResult.pagination} loading={isLoading} onPageChange={setPage} onPageSizeChange={setPageSize}
              onSortChange={setSort} onSelect={setSelectedJobId} onMapFocus={focusMapJob}
              onUserStateChange={(jobId,state)=>void updateJobState(jobId,state)}
              onResetFilters={() => setFilters({ ...DEFAULT_FILTERS, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds } })} />
          </section>
          {mapVisible && (isSinglePane === false || mobileView === "map") && <div id="dashboard-map" ref={mapSlotRef} className="map-slot">
            <MapPanel records={sorted} selectedJobId={selectedJobId} origin={origin} focusRequest={mapFocusRequest} onSelect={setSelectedJobId} onOriginChange={setOrigin} />
          </div>}
        </div>}
    </main>
  );
}
