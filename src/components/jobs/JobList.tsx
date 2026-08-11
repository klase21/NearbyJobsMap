"use client";

import { useEffect, useRef } from "react";
import type { SortOption, UiJobRecord, UserOrigin } from "../../domain/ui-job";
import type { JobUserState,JobUserStateInput } from "../../services/job-user-state";
import type{JobFreshness}from"../../services/job-freshness";
import { SORT_LABELS } from "../../services/job-display";
import { JobCard } from "./JobCard";
import type { DuplicateJobGroup, DuplicateJobGroupDetails, MonthlyDistanceRanking } from "../../server/jobs-page/contracts";

interface JobListProps {
  records: UiJobRecord[];
  selectedJobId: string | null;
  origin: UserOrigin;
  sort: SortOption;
  userStates: Record<string, JobUserState>;
  freshness?:Record<string,JobFreshness>|undefined;
  duplicateGroups: DuplicateJobGroup[];
  monthlyDistanceRankings?: MonthlyDistanceRanking[];
  loadDuplicateGroup(representativeId:string):Promise<DuplicateJobGroupDetails>;
  onSortChange(sort: SortOption): void;
  onSelect(jobId: string): void;
  onMapFocus(jobId: string): void;
  onUserStateChange(jobId:string,state:JobUserStateInput):void;
  onResetFilters(): void;
  pagination: { page:number;pageSize:number;totalItems:number;totalPages:number;hasPrevious:boolean;hasNext:boolean };
  onPageChange(page:number):void;
  onPageSizeChange(pageSize:number):void;
  loading?:boolean;
}

export function JobList(props: JobListProps) {
  const refs = useRef(new Map<string, HTMLElement>());
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (props.selectedJobId) refs.current.get(props.selectedJobId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [props.selectedJobId]);

  return (
    <>
      <div className="list-toolbar">
        <div><h2 className="result-title">검색 결과 <span>{props.pagination.totalItems.toLocaleString("ko-KR")}건</span></h2><span className="result-note">현재 필터 기준 · 목록이 주 화면입니다</span></div>
        <div className="list-toolbar-controls"><label><span className="sr-only">페이지당 공고 수</span><select aria-label="페이지당 공고 수" disabled={props.loading} className="select-input page-size-select" value={props.pagination.pageSize} onChange={(event) => props.onPageSizeChange(Number(event.target.value))}><option value="25">25개</option><option value="50">50개</option><option value="100">100개</option></select></label><label><span className="sr-only">정렬 방식</span><select disabled={props.loading} className="select-input sort-select" value={props.sort} onChange={(event) => props.onSortChange(event.target.value as SortOption)}>
          {Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label></div>
      </div>
      <div className="job-list" aria-label="통합 채용공고 목록">
        {props.records.length === 0 ? (
          <div className="state-panel"><h2>조건에 맞는 공고가 없습니다</h2><p>급여 단위나 지역 조건을 줄여 다시 확인해 보세요.</p><button className="button" type="button" onClick={props.onResetFilters}>필터 초기화</button></div>
        ) : props.records.map((record, index) => (
          <JobCard key={record.job.id} record={record} rank={index + 1} selected={props.selectedJobId === record.job.id} origin={props.origin}
            monthlyDistanceRanking={props.monthlyDistanceRankings?.find(ranking=>ranking.jobId===record.job.id)}
            duplicateGroup={props.duplicateGroups.find(group=>group.representativeId===record.job.id)}
            loadDuplicateGroup={props.loadDuplicateGroup}
            {...(props.userStates[record.job.id]?{userState:props.userStates[record.job.id]}:{})} onSelect={() => props.onSelect(record.job.id)} onMapFocus={() => props.onMapFocus(record.job.id)}
            {...(props.freshness?.[record.job.id]?{freshness:props.freshness[record.job.id]}:{})}
            onUserStateChange={(state) => props.onUserStateChange(record.job.id,state)}
            onDuplicateUserStateChange={props.onUserStateChange}
            cardRef={(node) => { if (node) refs.current.set(record.job.id, node); else refs.current.delete(record.job.id); }} />
        ))}
      </div>
      {props.pagination.totalItems>0&&<nav className="jobs-pagination" aria-label="공고 페이지 이동"><button type="button" className="button compact" disabled={props.loading||!props.pagination.hasPrevious} onClick={()=>props.onPageChange(props.pagination.page-1)}>이전</button><span aria-live="polite">{props.pagination.page} / {props.pagination.totalPages}</span><button type="button" className="button compact" disabled={props.loading||!props.pagination.hasNext} onClick={()=>props.onPageChange(props.pagination.page+1)}>다음</button></nav>}
    </>
  );
}
