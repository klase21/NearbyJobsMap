"use client";

import { useEffect, useRef } from "react";
import type { SortOption, UserJobStatus, UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { SORT_LABELS } from "../../services/job-display";
import { JobCard } from "./JobCard";

interface JobListProps {
  records: UiJobRecord[];
  selectedJobId: string | null;
  origin: UserOrigin;
  sort: SortOption;
  userStatuses: Record<string, UserJobStatus>;
  onSortChange(sort: SortOption): void;
  onSelect(jobId: string): void;
  onMapFocus(jobId: string): void;
  onUserStatusChange(jobId: string, status: UserJobStatus): void;
  onResetFilters(): void;
}

export function JobList(props: JobListProps) {
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (props.selectedJobId) refs.current.get(props.selectedJobId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [props.selectedJobId]);

  return (
    <>
      <div className="list-toolbar">
        <div><h2 className="result-title">검색 결과 <span>{props.records.length}건</span></h2><span className="result-note">현재 필터 기준 · 목록이 주 화면입니다</span></div>
        <label><span className="sr-only">정렬 방식</span><select className="select-input sort-select" value={props.sort} onChange={(event) => props.onSortChange(event.target.value as SortOption)}>
          {Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <div className="job-list" aria-label="통합 채용공고 목록">
        {props.records.length === 0 ? (
          <div className="state-panel"><h2>조건에 맞는 공고가 없습니다</h2><p>급여 단위나 지역 조건을 줄여 다시 확인해 보세요.</p><button className="button" type="button" onClick={props.onResetFilters}>필터 초기화</button></div>
        ) : props.records.map((record, index) => (
          <JobCard key={record.job.id} record={record} rank={index + 1} selected={props.selectedJobId === record.job.id} origin={props.origin}
            userStatus={props.userStatuses[record.job.id] ?? "reviewing"} onSelect={() => props.onSelect(record.job.id)} onMapFocus={() => props.onMapFocus(record.job.id)}
            onUserStatusChange={(status) => props.onUserStatusChange(record.job.id, status)}
            cardRef={(node) => { if (node) refs.current.set(record.job.id, node); else refs.current.delete(record.job.id); }} />
        ))}
      </div>
    </>
  );
}
