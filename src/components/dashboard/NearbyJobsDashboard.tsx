"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobFilterState, SavedPreferences, SortOption, UserJobStatus, UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { createPreferencesRepository, DEFAULT_PREFERENCES } from "../../repositories/preferences-repository";
import { filterJobs, DEFAULT_FILTERS, reconcileSelectedJobId, sortJobs } from "../../services/job-search";
import { FilterPanel } from "../filters/FilterPanel";
import { AppHeader } from "../header/AppHeader";
import { JobList } from "../jobs/JobList";
import { MapPanel } from "../map/MapPanel";
import { SummaryStrip } from "../summary/SummaryStrip";

interface NearbyJobsDashboardProps { initialJobs: UiJobRecord[]; dataError?: string }
const REFERENCE_NOW = new Date("2026-08-05T12:00:00+09:00");

export function NearbyJobsDashboard({ initialJobs, dataError }: NearbyJobsDashboardProps) {
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
  const listPanelRef = useRef<HTMLElement>(null);
  const mapSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const result = createPreferencesRepository(window.localStorage).load();
    setFilters(result.value.filters); setSort(result.value.sort); setMapVisible(result.value.mapVisible);
    setOrigin(result.value.origin); setUserStatuses(result.value.userJobStatuses); setCorruptedSettings(result.corrupted);
    setHydrated(true);
  }, []);

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

  const filtered = useMemo(() => filterJobs(initialJobs, filters, REFERENCE_NOW), [filters, initialJobs]);
  const sorted = useMemo(() => sortJobs(filtered, sort, origin), [filtered, origin, sort]);
  const visibleIds = useMemo(() => sorted.map(({ job }) => job.id), [sorted]);
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
  const setUserStatus = (jobId: string, status: UserJobStatus) => setUserStatuses((current) => ({ ...current, [jobId]: status }));
  const summary = useMemo(() => ({
    total: initialJobs.length,
    filtered: sorted.length,
    exact: sorted.filter(({ job }) => job.locationAccuracy === "exact_coordinate" || job.locationAccuracy === "exact_address").length,
    todayOrClosing: sorted.filter(({ job }) => job.postedAt?.startsWith("2026-08-05") || job.postingStatus === "closing_soon").length,
    jobKorea: sorted.filter(({ job }) => job.source === "jobkorea").length,
    albamon: sorted.filter(({ job }) => job.source === "albamon").length,
  }), [initialJobs.length, sorted]);

  return (
    <main className="app-shell">
      <AppHeader filters={filters} mapVisible={mapVisible} onFiltersChange={setFilters} onToggleFilters={() => setFiltersOpen(true)}
        onToggleMap={toggleMap} />
      <div className="notice-strip">
        <span><strong>fixture/demo 모드</strong> · 실시간 수집 없이 정제 fixture와 가상 공고만 표시합니다.</span>
        <span className="privacy-note">입력한 출발지와 화면 설정은 기본적으로 이 브라우저에만 저장됩니다. 브라우저 저장공간을 지우면 설정이 삭제될 수 있습니다.</span>
      </div>
      {corruptedSettings && <div className="warning-banner" role="alert">저장된 설정을 읽을 수 없어 안전한 기본값으로 초기화했습니다.</div>}
      {storageFailed && <div className="warning-banner" role="alert">브라우저 저장공간에 설정을 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.</div>}
      <SummaryStrip {...summary} />
      {filtersOpen && <FilterPanel filters={filters} jobs={initialJobs} onChange={setFilters} onClose={closeFilters} />}
      <div className="mobile-view-switch" aria-label="모바일 화면 전환">
        <button type="button" className={mobileView === "list" ? "active" : ""} onClick={() => showMobileView("list")} aria-pressed={mobileView === "list"}>목록</button>
        <button type="button" className={mobileView === "map" ? "active" : ""} onClick={() => showMobileView("map")} aria-pressed={mobileView === "map"}>지도</button>
      </div>
      <p className="sr-only" aria-live="polite">현재 필터 결과 {sorted.length}건</p>
      {dataError ? <div className="state-panel" role="alert"><h2>데이터를 표시할 수 없습니다</h2><p>{dataError}</p></div>
        : initialJobs.length === 0 ? <div className="state-panel"><h2>불러온 공고가 없습니다</h2><p>sanitized fixture와 demo provider를 확인해 주세요.</p></div>
        : <div className={`dashboard-body ${mapVisible ? "" : "map-hidden"}`}>
          <section ref={listPanelRef} className={`list-panel ${mobileView === "map" ? "mobile-hidden" : ""}`} aria-label="통합 공고 목록 패널">
            <JobList records={sorted} selectedJobId={selectedJobId} origin={origin} sort={sort} userStatuses={userStatuses}
              onSortChange={setSort} onSelect={setSelectedJobId} onMapFocus={focusMapJob} onUserStatusChange={setUserStatus}
              onResetFilters={() => setFilters({ ...DEFAULT_FILTERS, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds } })} />
          </section>
          {mapVisible && (isSinglePane === false || mobileView === "map") && <div id="dashboard-map" ref={mapSlotRef} className="map-slot">
            <MapPanel records={sorted} selectedJobId={selectedJobId} origin={origin} focusRequest={mapFocusRequest} onSelect={setSelectedJobId} onOriginChange={setOrigin} />
          </div>}
        </div>}
    </main>
  );
}
