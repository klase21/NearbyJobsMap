"use client";

import type { UiJobRecord, UserOrigin,UserJobStatus } from "../../domain/ui-job";
import { haversineDistanceKm } from "../../services/distance";
import { formatDate, formatWon, LOCATION_LABELS, POSTING_STATUS_LABELS, SALARY_CONFIDENCE_LABELS, SOURCE_LABELS,USER_STATUS_LABELS } from "../../services/job-display";
import { defaultJobUserState,JOB_WORKFLOW_LABELS,type JobUserState,type JobUserStateInput } from "../../services/job-user-state";
import{freshnessLabel,type JobFreshness}from"../../services/job-freshness";
import { useEffect,useMemo,useState } from "react";
import { getJobDataLabel, getMapPositions, isMapEligible } from "../../services/job-search";

interface JobCardProps {
  record: UiJobRecord;
  rank: number;
  selected: boolean;
  origin: UserOrigin;
  userState?: JobUserState|undefined;
  userStatus?:UserJobStatus|undefined;
  freshness?:JobFreshness|undefined;
  onSelect(): void;
  onMapFocus(): void;
  onUserStateChange?(state:JobUserStateInput):void;
  onUserStatusChange?(status:UserJobStatus):void;
  cardRef(node: HTMLElement | null): void;
}

const isExact = (record: UiJobRecord) => record.job.locationAccuracy === "exact_coordinate" || record.job.locationAccuracy === "exact_address";

export function JobCard({ record, rank, selected, origin, userState, userStatus,freshness, onSelect, onMapFocus, onUserStateChange=()=>{},onUserStatusChange, cardRef }: JobCardProps) {
  const { job } = record;
  const state=useMemo(()=>userState??defaultJobUserState(job.id),[userState,job.id]);const[draft,setDraft]=useState(state);useEffect(()=>setDraft(state),[state]);
  const input=(next:JobUserState):JobUserStateInput=>({isFavorite:next.isFavorite,workflowStatus:next.workflowStatus,isHidden:next.isHidden,isArchived:next.isArchived,note:next.note,applicationDate:next.applicationDate,followUpAt:next.followUpAt,personalDeadline:next.personalDeadline,expectedUpdatedAt:state.updatedAt||null});
  const mapEligible = isMapEligible(record);
  const distances = getMapPositions(record).map((position) => haversineDistanceKm(origin, position));
  const distance = distances.length ? Math.min(...distances) : null;
  const hours = job.workStartTime && job.workEndTime ? `${job.workStartTime}~${job.workEndTime}` : "시간 미확인";
  const monthly = job.salary.normalizedMonthlyMinimum;
  const administrativeArea = [job.city, job.district].filter(Boolean).join(" · ");
  const workplacePreview = job.workplaces.slice(0, 2).map((workplace) => workplace.originalText).join(" · ");
  const sourceFilterRegionLabel = record.regionEvidenceSource === "source_filter"
    ? record.normalizedRegions?.includes("seoul") ? "서울" : record.normalizedRegions?.includes("gyeonggi") ? "경기" : null
    : null;
  const mapUnavailableReason = job.locationAccuracy === "location_undecided" ? "근무지가 결정되지 않아 지도에 표시할 수 없습니다." : job.locationAccuracy === "multiple_locations" ? "개별 근무지 좌표가 확인되지 않아 지도에 표시할 수 없습니다." : "사용 가능한 좌표가 없습니다.";
  return (
    <article ref={cardRef} className={`job-card ${selected ? "selected" : ""} ${state.workflowStatus === "ignored" ? "excluded" : ""}`} aria-current={selected ? "true" : undefined}>
      <div className="job-card-top">
        <span className="rank" aria-label={`${rank}번째 공고`}>{rank}</span>
        <div>
          <h3 className="job-title"><button type="button" className="job-title-button" onClick={onSelect}>{job.title}</button></h3>
          <p className="company">{job.companyName}</p>
        </div>
        <span className={`source-badge source-${job.source}`}>{SOURCE_LABELS[job.source as keyof typeof SOURCE_LABELS]}</span>
      </div>
      <div className="job-badges">
        {freshness&&<span className="badge">{freshness.changedSincePrevious?"변경됨":freshness.observationCount===1?"신규":freshnessLabel(freshness.daysSinceLastSeen)}</span>}
        <span className={`badge ${record.isFictional ? "demo" : ""}`}>{getJobDataLabel(record)}</span>
        {record.observationKind === "bounded_listing_collection" && <span className="badge">목록 정보</span>}
        {record.observationKind === "bounded_manual_collection" && <span className="badge exact">상세 확인</span>}
        <span className={`badge ${isExact(record) ? "exact" : "estimated"}`}>{LOCATION_LABELS[job.locationAccuracy]}</span>
        <span className={`badge ${job.postingStatus === "closing_soon" ? "closing" : ""}`}>{POSTING_STATUS_LABELS[job.postingStatus]}</span>
        {job.categories.map((category) => <span className="badge" key={category}>{category}</span>)}
        {job.employmentTypes.map((type) => <span className="badge" key={type}>{type}</span>)}
      </div>
      {record.observationKind === "bounded_manual_collection" && <p className="observation-note">수동 수집 · 상세 확인 · {record.observedAt ? `${formatDate(record.observedAt)} 확인` : "확인 시각 미상"} · 원문을 최종 기준으로 확인하세요.</p>}
      {record.observationKind === "bounded_listing_collection" && <p className="observation-note">{job.source === "albamon" ? "알바몬" : "잡코리아"} 목록 페이지에서 수집된 정보이며 상세 내용은 확인되지 않았습니다. · {record.observedAt ? `${formatDate(record.observedAt)} 확인` : "확인 시각 미상"}</p>}
      {job.source === "albamon" && sourceFilterRegionLabel && <p className="observation-note">{sourceFilterRegionLabel} · 지역은 알바몬 검색 조건을 기준으로 분류되었습니다.</p>}
      {record.provenanceKind === "live_one_shot_observation" && record.observationKind !== "bounded_manual_collection" && <p className="observation-note">제한적 공개 페이지 관찰 · {record.observedAt ? `${formatDate(record.observedAt)} 확인` : "확인 시각 미상"}</p>}
      <div className="job-primary">
        <div>
          <div className="salary">{job.salary.originalText || "급여 미확인"}
            {monthly !== null && <span className="normalized">월 환산 예상 {formatWon(monthly)} · 신뢰도 {job.salary.normalizationConfidence ? SALARY_CONFIDENCE_LABELS[job.salary.normalizationConfidence] : "미정"}</span>}
          </div>
          <div className="detail-line"><strong>근무</strong> {job.workDaysOriginalText ?? "요일 미확인"} · {hours}</div>
          <div className="detail-line"><strong>조건</strong> {job.experienceRequirement ?? "경력 미확인"} · {job.educationRequirement ?? "학력 미확인"}</div>
        </div>
        <div>
          {job.addressOriginalText && <div className="detail-line"><strong>위치</strong> {job.addressOriginalText}</div>}
          {!job.addressOriginalText && record.regionEvidenceSource !== "source_filter" && <div className="detail-line"><strong>위치</strong> 위치정보 없음</div>}
          {job.locationAccuracy === "multiple_locations" && <div className="detail-line"><strong>복수 근무지</strong> {job.workplaceCount !== null ? `${job.workplaceCount}곳` : "개수 미확인"}{workplacePreview ? ` · ${workplacePreview}` : ""}</div>}
          {administrativeArea && <div className="detail-line"><strong>행정구역</strong> {administrativeArea}</div>}
          {job.nearestStation && <div className="detail-line"><strong>인근역</strong> {job.nearestStation}</div>}
          {distance !== null && <div className="detail-line"><strong>거리</strong> {distance.toFixed(1)}km · 직선거리</div>}
          <div className="detail-line"><strong>등록</strong> {formatDate(job.postedAt)} · <strong>마감</strong> {formatDate(job.expiresAt)}</div>
        </div>
      </div>
      <div className="job-actions">
        <button className="action-button" aria-pressed={state.isFavorite} onClick={()=>onUserStateChange(input({...state,isFavorite:!state.isFavorite}))}>{state.isFavorite?"★ 관심 해제":"☆ 관심"}</button>
        {record.safeSourceUrl ? <a className="action-link" href={record.safeSourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${job.title} 원문 새 창에서 보기`}>원문 보기 ↗</a>
          : <span className="detail-line">{record.isFictional ? "가상 공고 · 원문 없음" : "안전한 원문 URL 없음"}</span>}
        <button type="button" className="action-button" disabled={!mapEligible} onClick={onMapFocus} aria-label={mapEligible ? `${job.title} 지도에서 보기` : `${job.title} 지도 표시 불가: ${mapUnavailableReason}`} title={!mapEligible ? mapUnavailableReason : undefined}>
          {mapEligible ? "지도에서 보기" : job.locationAccuracy === "location_undecided" || job.locationAccuracy === "multiple_locations" ? "지도 표시 불가" : "지도 좌표 없음"}
        </button>
        <label className="sr-only" htmlFor={`status-${job.id}`}>{userStatus?"사용자 상태":"지원 상태"}</label>
        {userStatus?<select id={`status-${job.id}`} className="status-select" value={userStatus} onChange={event=>onUserStatusChange?.(event.target.value as UserJobStatus)}>{Object.entries(USER_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<select id={`status-${job.id}`} className="status-select" value={state.workflowStatus} onChange={(event) => onUserStateChange(input({...state,workflowStatus:event.target.value as JobUserState["workflowStatus"]}))}>{Object.entries(JOB_WORKFLOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        <button className="action-button" onClick={()=>onUserStateChange(input({...state,isHidden:!state.isHidden}))}>{state.isHidden?"숨김 해제":"숨기기"}</button>
      </div>
      {selected&&<section className="job-workspace" aria-label="개인 지원 관리"><h4>개인 지원 관리</h4><div className="profile-form-grid"><label>지원일<input type="date" value={draft.applicationDate??""} onChange={e=>setDraft({...draft,applicationDate:e.target.value||null})}/></label><label>후속 확인일<input type="date" value={draft.followUpAt??""} onChange={e=>setDraft({...draft,followUpAt:e.target.value||null})}/></label><label>개인 마감일<input type="date" value={draft.personalDeadline??""} onChange={e=>setDraft({...draft,personalDeadline:e.target.value||null})}/></label></div><label>개인 메모<textarea maxLength={5000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label><small>{draft.note.length}/5000 · source 공고와 분리 저장</small><div className="profile-actions"><button className="button primary compact" onClick={()=>onUserStateChange(input(draft))}>개인 정보 저장</button><button className="button compact" onClick={()=>onUserStateChange(input({...state,isArchived:!state.isArchived}))}>{state.isArchived?"보관 해제":"보관"}</button></div></section>}
    </article>
  );
}
