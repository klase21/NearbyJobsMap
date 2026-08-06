"use client";

import type { JobFilterState } from "../../domain/ui-job";

interface AppHeaderProps {
  filters: JobFilterState;
  mapVisible: boolean;
  onFiltersChange(filters: JobFilterState): void;
  onToggleFilters(): void;
  onToggleMap(): void;
  availableSources: Array<"jobkorea" | "albamon">;
  activeFilterCount: number;
}

export function AppHeader({ filters, mapVisible, onFiltersChange, onToggleFilters, onToggleMap, availableSources, activeFilterCount }: AppHeaderProps) {
  const setSource = (source: JobFilterState["source"]) => onFiltersChange({ ...filters, source });
  return (
    <header className="app-header">
      <div className="header-grid">
        <div className="brand">
          <h1 className="brand-title">내 주변 일자리 지도</h1>
          <p className="brand-subtitle">여러 사이트의 채용공고를 한 번에 보고, 위치와 급여를 함께 비교하세요.</p>
        </div>
        <div className="search-wrap">
          <label className="sr-only" htmlFor="job-keyword">직무, 회사명, 지역 검색</label>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input id="job-keyword" className="text-input search-input" type="search" value={filters.keyword}
            onChange={(event) => onFiltersChange({ ...filters, keyword: event.target.value })} placeholder="직무, 회사명, 지역 검색" />
        </div>
        <nav className="source-tabs" aria-label="채용공고 출처">
          {([ ["all", "전체"], ...availableSources.map((source) => [source, source === "jobkorea" ? "잡코리아" : "알바몬"] as const) ] as const).map(([value, label]) => (
            <button key={value} type="button" className={`source-tab ${filters.source === value ? "active" : ""}`}
              aria-pressed={filters.source === value} onClick={() => setSource(value)}>{label}</button>
          ))}
          <span className="roadmap-tab" aria-label="고용24는 추후 지원 예정">고용24 · 추후 지원</span>
        </nav>
        <div className="header-actions">
          <button type="button" className="button" onClick={onToggleFilters} aria-haspopup="dialog" aria-controls="filter-panel">필터{activeFilterCount ? ` ${activeFilterCount}` : ""}</button>
          <button type="button" className={`button ${mapVisible ? "primary" : "soft"}`} onClick={onToggleMap} aria-pressed={mapVisible} aria-controls="dashboard-map">
            {mapVisible ? "지도 접기" : "지도 보기"}
          </button>
        </div>
      </div>
    </header>
  );
}
