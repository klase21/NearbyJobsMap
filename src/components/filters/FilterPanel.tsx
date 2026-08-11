"use client";

import { useEffect, useRef, useState } from "react";
import type { JobFilterState, UiJobRecord } from "../../domain/ui-job";
import { LOCATION_LABELS, POSTING_STATUS_LABELS, SALARY_TYPE_LABELS } from "../../services/job-display";
import { DEFAULT_FILTERS, getNormalizedRegions, isMapEligible } from "../../services/job-search";
import { DEFAULT_EXCLUSION_FIELDS, EXCLUSION_FIELDS, MAX_MANUAL_EXCLUSION_KEYWORDS, normalizeExclusionText, splitExclusionKeywordInput, type ExclusionField } from "../../services/collection-exclusion";
import type { JobsFacetSummary } from "../../server/jobs-page/contracts";

interface FilterPanelProps {
  filters: JobFilterState;
  facets?: JobsFacetSummary;
  jobs?: UiJobRecord[];
  onChange(filters: JobFilterState): void;
  onClose(): void;
}

const unique=(values:Array<string|null>)=>[...new Set(values.filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ko"));
const facetsFromJobs=(jobs:UiJobRecord[]):JobsFacetSummary=>({total:jobs.length,sources:{jobkorea:jobs.filter(r=>r.job.source==="jobkorea").length,albamon:jobs.filter(r=>r.job.source==="albamon").length},provenance:{manual:jobs.filter(r=>r.observationKind==="bounded_manual_collection"||r.observationKind==="bounded_listing_collection").length,fixture:jobs.filter(r=>r.provenanceKind==="fixture_derived").length,demo:jobs.filter(r=>r.isFictional).length},completeness:{listing_only:jobs.filter(r=>r.observationKind==="bounded_listing_collection").length,detail_complete:jobs.filter(r=>r.observationKind==="bounded_manual_collection").length},regions:{seoul:jobs.filter(r=>getNormalizedRegions(r).includes("seoul")).length,gyeonggi:jobs.filter(r=>getNormalizedRegions(r).includes("gyeonggi")).length,capital_scope:jobs.filter(r=>getNormalizedRegions(r).includes("capital_scope")).length,other:jobs.filter(r=>getNormalizedRegions(r).some(x=>x==="other"||x==="incheon")).length,unknown:jobs.filter(r=>getNormalizedRegions(r).length===0).length},mapEligible:jobs.filter(isMapEligible).length,cities:unique(jobs.map(r=>r.job.city)),districts:unique(jobs.map(r=>r.job.district)),categories:unique(jobs.flatMap(r=>r.job.categories)),employmentTypes:unique(jobs.flatMap(r=>r.job.employmentTypes)),experienceRequirements:unique(jobs.map(r=>r.job.experienceRequirement)),educationRequirements:unique(jobs.map(r=>r.job.educationRequirement))});

export function FilterPanel({ filters, facets:providedFacets, jobs=[], onChange, onClose }: FilterPanelProps) {
  const facets=providedFacets??facetsFromJobs(jobs);
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
  const [displayExclusionText, setDisplayExclusionText] = useState(filters.exclusionKeywords.join(", "));
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstControlRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previouslyFocused?.focus(); };
  }, [onClose]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobileDrawer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isMobileDrawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isMobileDrawer]);

  const cities = facets.cities;
  const districts = facets.districts;
  const categories = facets.categories;
  const employmentTypes = facets.employmentTypes;
  const experience = facets.experienceRequirements;
  const education = facets.educationRequirements;
  const sources = (["jobkorea","albamon"] as const).filter(source=>(facets.sources[source]??0)>0);
  const sourceOptions: Array<[string,string]> = [["all", `전체 (${facets.total})`], ...sources.map((source) => [source, `${source === "jobkorea" ? "잡코리아" : "알바몬"} (${facets.sources[source]??0})`] as [string,string])];

  const update = <K extends keyof JobFilterState>(key: K, value: JobFilterState[K]) => onChange({ ...filters, [key]: value });
  const setRegion = (region: JobFilterState["region"]) => onChange({ ...filters, region, city: "", district: "" });
  const setCity = (city: string) => onChange({ ...filters, city, district: "" });
  const setSalaryType = (salaryType: JobFilterState["salaryType"]) => onChange({
    ...filters,
    salaryType,
    salaryThresholds: {
      ...filters.salaryThresholds,
      hourly: salaryType === "hourly" || salaryType === "all" ? filters.salaryThresholds.hourly : 0,
      daily: salaryType === "daily" || salaryType === "all" ? filters.salaryThresholds.daily : 0,
      monthly: salaryType === "monthly" || salaryType === "all" ? filters.salaryThresholds.monthly : 0,
      annual: salaryType === "annual" || salaryType === "all" ? filters.salaryThresholds.annual : 0,
    },
  });
  const resetFilters = () => onChange({ ...DEFAULT_FILTERS, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds } });
  const setDisplayExclusions = (raw: string) => update("exclusionKeywords", [...new Set(splitExclusionKeywordInput(raw).map(normalizeExclusionText).filter((value) => value.length >= 2 && value.length <= 50))].slice(0, MAX_MANUAL_EXCLUSION_KEYWORDS));
  const toggleExclusionField = (field: ExclusionField) => update("exclusionFields", filters.exclusionFields.includes(field) ? filters.exclusionFields.filter((item) => item !== field) : [...filters.exclusionFields, field]);
  const threshold = (key: keyof JobFilterState["salaryThresholds"], value: string) => {
    const parsed = Number(value);
    onChange({ ...filters, salaryThresholds: { ...filters.salaryThresholds, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 } });
  };

  return (
    <>
      <button className="filter-backdrop" aria-label="필터 닫기" type="button" onClick={onClose} />
      <section id="filter-panel" ref={panelRef} className="filter-panel" role="dialog" aria-modal={isMobileDrawer} aria-labelledby="filter-title">
        <div className="filter-heading"><h2 id="filter-title">상세 필터</h2><button className="button compact" type="button" onClick={onClose}>닫기</button></div>
        <div className="filter-grid">
          <SelectField ref={firstControlRef} label="출처" value={filters.source} onChange={(value) => update("source", value as JobFilterState["source"])} options={sourceOptions} />
          <SelectField label="데이터 출처" value={filters.provenance} onChange={(value) => update("provenance", value as JobFilterState["provenance"])} options={[["all",`전체 (${facets.total})`],["manual",`수동 수집 (${facets.provenance.manual??0})`],["fixture",`픽스처 (${facets.provenance.fixture??0})`],["demo",`데모 (${facets.provenance.demo??0})`]]} />
          <SelectField label="정보 완성도" value={filters.completeness} onChange={(value) => update("completeness", value as JobFilterState["completeness"])} options={[["all",`전체 (${facets.total})`],["listing_only",`목록 정보 (${facets.completeness.listing_only??0})`],["detail_complete",`상세 확인 (${facets.completeness.detail_complete??0})`]]} />
          <SelectField label="지역" value={filters.region} onChange={(value) => setRegion(value as JobFilterState["region"])} options={[["all",`전체 (${facets.total})`],["seoul",`서울 (${facets.regions.seoul??0})`],["gyeonggi",`경기 (${facets.regions.gyeonggi??0})`],["capital_scope",`수도권 범위만 확인 (${facets.regions.capital_scope??0})`],["other",`기타 (${facets.regions.other??0})`],["unknown",`지역 미확인 (${facets.regions.unknown??0})`]]} />
          <SelectField label="지도 표시" value={filters.mapEligibility} onChange={(value) => update("mapEligibility", value as JobFilterState["mapEligibility"])} options={[["all",`전체 (${facets.total})`],["map",`지도 표시 가능 (${facets.mapEligible})`],["list_only",`목록만 (${facets.total-facets.mapEligible})`]]} />
          <SelectField label="시·도시" value={filters.city} onChange={setCity} options={[["","전체"], ...cities.map((value) => [value,value] as [string,string])]} />
          <SelectField label="구·지역" value={filters.district} onChange={(value) => update("district", value)} options={[["","전체"], ...districts.map((value) => [value,value] as [string,string])]} />
          <SelectField label="직종" value={filters.category} onChange={(value) => update("category", value)} options={[["","전체"], ...categories.map((value) => [value,value] as [string,string])]} />
          <SelectField label="고용형태" value={filters.employmentType} onChange={(value) => update("employmentType", value)} options={[["","전체"], ...employmentTypes.map((value) => [value,value] as [string,string])]} />
          <SelectField label="급여 유형" value={filters.salaryType} onChange={(value) => setSalaryType(value as JobFilterState["salaryType"])} options={[["all","전체"], ...Object.entries(SALARY_TYPE_LABELS)]} />
          <SelectField label="경력" value={filters.experienceRequirement} onChange={(value) => update("experienceRequirement", value)} options={[["","전체"], ...experience.map((value) => [value,value] as [string,string])]} />
          <SelectField label="학력" value={filters.educationRequirement} onChange={(value) => update("educationRequirement", value)} options={[["","전체"], ...education.map((value) => [value,value] as [string,string])]} />
          <SelectField label="공고 상태" value={filters.postingStatus} onChange={(value) => update("postingStatus", value as JobFilterState["postingStatus"])} options={[["all","전체"], ...Object.entries(POSTING_STATUS_LABELS)]} />
          <SelectField label="위치 정확도" value={filters.locationAccuracy} onChange={(value) => update("locationAccuracy", value as JobFilterState["locationAccuracy"])} options={[["all","전체"], ...Object.entries(LOCATION_LABELS)]} />
          <SelectField label="정확·추정 위치" value={filters.locationMode} onChange={(value) => update("locationMode", value as JobFilterState["locationMode"])} options={[["all","전체"],["exact","정확한 주소·좌표"],["estimated","추정 위치"]]} />
          <SelectField label="마감" value={filters.deadline} onChange={(value) => update("deadline", value as JobFilterState["deadline"])} options={[["all","전체"],["within_3_days","3일 이내"],["within_7_days","7일 이내"],["no_deadline","마감일 미확인"]]} />
          <SelectField label="등록·발견일" value={filters.discoveryDate} onChange={(value) => update("discoveryDate", value as JobFilterState["discoveryDate"])} options={[["all","전체"],["today_posted","오늘 등록"],["today_first_seen","오늘 처음 발견"]]} />
        </div>
        <div className="threshold-grid">
          <NumberField label="최소 시급 (원)" value={filters.salaryThresholds.hourly} disabled={filters.salaryType !== "all" && filters.salaryType !== "hourly"} onChange={(value) => threshold("hourly", value)} placeholder="예: 13000" />
          <NumberField label="최소 일급 (원)" value={filters.salaryThresholds.daily} disabled={filters.salaryType !== "all" && filters.salaryType !== "daily"} onChange={(value) => threshold("daily", value)} placeholder="예: 140000" />
          <NumberField label="최소 월급 (원)" value={filters.salaryThresholds.monthly} disabled={filters.salaryType !== "all" && filters.salaryType !== "monthly"} onChange={(value) => threshold("monthly", value)} placeholder="예: 2800000" />
          <NumberField label="최소 연봉 (원)" value={filters.salaryThresholds.annual} disabled={filters.salaryType !== "all" && filters.salaryType !== "annual"} onChange={(value) => threshold("annual", value)} placeholder="예: 40000000" />
          <NumberField label="월 환산 예상 최소 (원)" value={filters.salaryThresholds.normalizedMonthly} onChange={(value) => threshold("normalizedMonthly", value)} placeholder="비교용 추정치" />
          <NumberField label="최대 거리 (km)" value={filters.maxDistanceKm} onChange={(value) => update("maxDistanceKm", Math.min(500, Math.max(0, Number(value) || 0)))} placeholder="예: 10" />
        </div>
        <details className="display-exclusion-controls"><summary>화면 제외 키워드 {filters.exclusionKeywords.length ? `(${filters.exclusionKeywords.length})` : ""}</summary>
          <p>저장된 데이터를 삭제하지 않고 현재 화면에서만 숨깁니다.</p>
          <label>제외 키워드<textarea value={displayExclusionText} placeholder="전기, 강사" onChange={(event) => setDisplayExclusionText(event.target.value)} onBlur={() => setDisplayExclusions(displayExclusionText)} /></label>
          <div className="exclusion-fields">{EXCLUSION_FIELDS.map((field) => <label key={field}><input type="checkbox" checked={filters.exclusionFields.includes(field)} onChange={() => toggleExclusionField(field)} /> {{ title: "공고명", company: "회사명", location: "지역", category: "직종·카테고리", employment_type: "고용형태", work_schedule: "근무 일정" }[field]}</label>)}</div>
          <button type="button" className="button compact" onClick={() => setDisplayExclusions(displayExclusionText)}>적용</button> <button type="button" className="button compact" onClick={() => { setDisplayExclusionText(""); onChange({ ...filters, exclusionKeywords: [], exclusionFields: DEFAULT_EXCLUSION_FIELDS }); }}>화면 제외 초기화</button>
        </details>
        <div className="filter-footer">
          <label className="checkbox-line"><input type="checkbox" checked={filters.showDemo} onChange={(event) => update("showDemo", event.target.checked)} /> 기능 검증용 가상 공고 포함</label>
          <div className="filter-actions"><button className="button" type="button" onClick={resetFilters}>필터 초기화</button><button className="button primary" type="button" onClick={onClose}>결과 보기</button></div>
        </div>
      </section>
    </>
  );
}

interface SelectFieldProps { label: string; value: string; options: Array<[string,string]>; onChange(value: string): void }
const SelectField = ({ label, value, options, onChange, ref }: SelectFieldProps & { ref?: React.Ref<HTMLSelectElement> }) => (
  <div className="filter-field"><label>{label}<select ref={ref} className="select-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select></label></div>
);

const NumberField = ({ label, value, placeholder, disabled = false, onChange }: { label: string; value: number; placeholder: string; disabled?: boolean; onChange(value: string): void }) => (
  <div className="filter-field"><label>{label}<input className="text-input" type="number" min="0" inputMode="numeric" disabled={disabled} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label></div>
);
