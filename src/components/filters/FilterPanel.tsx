"use client";

import { useEffect, useRef, useState } from "react";
import type { JobFilterState, UiJobRecord } from "../../domain/ui-job";
import { LOCATION_LABELS, POSTING_STATUS_LABELS, SALARY_TYPE_LABELS } from "../../services/job-display";
import { DEFAULT_FILTERS } from "../../services/job-search";

interface FilterPanelProps {
  filters: JobFilterState;
  jobs: UiJobRecord[];
  onChange(filters: JobFilterState): void;
  onClose(): void;
}

const unique = (values: Array<string | null>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko"));

export function FilterPanel({ filters, jobs, onChange, onClose }: FilterPanelProps) {
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
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
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobileDrawer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const cities = unique(jobs.map(({ job }) => job.city));
  const districts = unique(jobs.filter(({ job }) => !filters.city || job.city === filters.city).map(({ job }) => job.district));
  const categories = unique(jobs.flatMap(({ job }) => job.categories));
  const employmentTypes = unique(jobs.flatMap(({ job }) => job.employmentTypes));
  const experience = unique(jobs.map(({ job }) => job.experienceRequirement));
  const education = unique(jobs.map(({ job }) => job.educationRequirement));

  const update = <K extends keyof JobFilterState>(key: K, value: JobFilterState[K]) => onChange({ ...filters, [key]: value });
  const threshold = (key: keyof JobFilterState["salaryThresholds"], value: string) => {
    const parsed = Number(value);
    onChange({ ...filters, salaryThresholds: { ...filters.salaryThresholds, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 } });
  };

  return (
    <>
      <button className="filter-backdrop" aria-label="필터 닫기" type="button" onClick={onClose} />
      <section ref={panelRef} className="filter-panel" role="dialog" aria-modal={isMobileDrawer} aria-labelledby="filter-title">
        <div className="filter-heading"><h2 id="filter-title">상세 필터</h2><button className="button compact" type="button" onClick={onClose}>닫기</button></div>
        <div className="filter-grid">
          <SelectField ref={firstControlRef} label="서울·경기" value={filters.region} onChange={(value) => update("region", value as JobFilterState["region"])} options={[["all","전체"],["서울","서울"],["경기","경기"]]} />
          <SelectField label="시·도시" value={filters.city} onChange={(value) => update("city", value)} options={[["","전체"], ...cities.map((value) => [value,value] as [string,string])]} />
          <SelectField label="구·지역" value={filters.district} onChange={(value) => update("district", value)} options={[["","전체"], ...districts.map((value) => [value,value] as [string,string])]} />
          <SelectField label="직종" value={filters.category} onChange={(value) => update("category", value)} options={[["","전체"], ...categories.map((value) => [value,value] as [string,string])]} />
          <SelectField label="고용형태" value={filters.employmentType} onChange={(value) => update("employmentType", value)} options={[["","전체"], ...employmentTypes.map((value) => [value,value] as [string,string])]} />
          <SelectField label="급여 유형" value={filters.salaryType} onChange={(value) => update("salaryType", value as JobFilterState["salaryType"])} options={[["all","전체"], ...Object.entries(SALARY_TYPE_LABELS)]} />
          <SelectField label="경력" value={filters.experienceRequirement} onChange={(value) => update("experienceRequirement", value)} options={[["","전체"], ...experience.map((value) => [value,value] as [string,string])]} />
          <SelectField label="학력" value={filters.educationRequirement} onChange={(value) => update("educationRequirement", value)} options={[["","전체"], ...education.map((value) => [value,value] as [string,string])]} />
          <SelectField label="공고 상태" value={filters.postingStatus} onChange={(value) => update("postingStatus", value as JobFilterState["postingStatus"])} options={[["all","전체"], ...Object.entries(POSTING_STATUS_LABELS)]} />
          <SelectField label="위치 정확도" value={filters.locationAccuracy} onChange={(value) => update("locationAccuracy", value as JobFilterState["locationAccuracy"])} options={[["all","전체"], ...Object.entries(LOCATION_LABELS)]} />
          <SelectField label="정확·추정 위치" value={filters.locationMode} onChange={(value) => update("locationMode", value as JobFilterState["locationMode"])} options={[["all","전체"],["exact","정확한 주소·좌표"],["estimated","추정 위치"]]} />
          <SelectField label="마감" value={filters.deadline} onChange={(value) => update("deadline", value as JobFilterState["deadline"])} options={[["all","전체"],["within_3_days","3일 이내"],["within_7_days","7일 이내"],["no_deadline","마감일 미확인"]]} />
        </div>
        <div className="threshold-grid">
          <NumberField label="최소 시급 (원)" value={filters.salaryThresholds.hourly} onChange={(value) => threshold("hourly", value)} placeholder="예: 13000" />
          <NumberField label="최소 일급 (원)" value={filters.salaryThresholds.daily} onChange={(value) => threshold("daily", value)} placeholder="예: 140000" />
          <NumberField label="최소 월급 (원)" value={filters.salaryThresholds.monthly} onChange={(value) => threshold("monthly", value)} placeholder="예: 2800000" />
          <NumberField label="최소 연봉 (원)" value={filters.salaryThresholds.annual} onChange={(value) => threshold("annual", value)} placeholder="예: 40000000" />
          <NumberField label="월 환산 예상 최소 (원)" value={filters.salaryThresholds.normalizedMonthly} onChange={(value) => threshold("normalizedMonthly", value)} placeholder="비교용 추정치" />
        </div>
        <div className="filter-footer">
          <label className="checkbox-line"><input type="checkbox" checked={filters.showDemo} onChange={(event) => update("showDemo", event.target.checked)} /> 기능 검증용 가상 공고 포함</label>
          <div className="filter-actions"><button className="button" type="button" onClick={() => onChange(DEFAULT_FILTERS)}>필터 초기화</button><button className="button primary" type="button" onClick={onClose}>결과 보기</button></div>
        </div>
      </section>
    </>
  );
}

interface SelectFieldProps { label: string; value: string; options: Array<[string,string]>; onChange(value: string): void }
const SelectField = ({ label, value, options, onChange, ref }: SelectFieldProps & { ref?: React.Ref<HTMLSelectElement> }) => (
  <div className="filter-field"><label>{label}<select ref={ref} className="select-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select></label></div>
);

const NumberField = ({ label, value, placeholder, onChange }: { label: string; value: number; placeholder: string; onChange(value: string): void }) => (
  <div className="filter-field"><label>{label}<input className="text-input" type="number" min="0" inputMode="numeric" value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label></div>
);
