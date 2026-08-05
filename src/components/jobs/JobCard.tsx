"use client";

import type { UserJobStatus, UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { haversineDistanceKm } from "../../services/distance";
import { formatDate, formatWon, LOCATION_LABELS, POSTING_STATUS_LABELS, SALARY_CONFIDENCE_LABELS, SOURCE_LABELS, USER_STATUS_LABELS } from "../../services/job-display";
import { getJobDataLabel } from "../../services/job-search";

interface JobCardProps {
  record: UiJobRecord;
  rank: number;
  selected: boolean;
  origin: UserOrigin;
  userStatus: UserJobStatus;
  onSelect(): void;
  onMapFocus(): void;
  onUserStatusChange(status: UserJobStatus): void;
  cardRef(node: HTMLElement | null): void;
}

const isExact = (record: UiJobRecord) => record.job.locationAccuracy === "exact_coordinate" || record.job.locationAccuracy === "exact_address";

export function JobCard({ record, rank, selected, origin, userStatus, onSelect, onMapFocus, onUserStatusChange, cardRef }: JobCardProps) {
  const { job } = record;
  const distance = record.mapPosition ? haversineDistanceKm(origin, record.mapPosition) : null;
  const hours = job.workStartTime && job.workEndTime ? `${job.workStartTime}~${job.workEndTime}` : "시간 미확인";
  const monthly = job.salary.normalizedMonthlyMinimum;
  const administrativeArea = [job.city, job.district].filter(Boolean).join(" · ");
  return (
    <article ref={cardRef} className={`job-card ${selected ? "selected" : ""} ${userStatus === "excluded" ? "excluded" : ""}`} aria-current={selected ? "true" : undefined}>
      <div className="job-card-top">
        <span className="rank" aria-label={`${rank}번째 공고`}>{rank}</span>
        <div>
          <button type="button" className="action-button" onClick={onSelect} style={{ color: "inherit", padding: 0, textAlign: "left" }}>
            <h2 className="job-title">{job.title}</h2>
          </button>
          <p className="company">{job.companyName}</p>
        </div>
        <span className={`source-badge source-${job.source}`}>{SOURCE_LABELS[job.source as keyof typeof SOURCE_LABELS]}</span>
      </div>
      <div className="job-badges">
        <span className={`badge ${record.isFictional ? "demo" : ""}`}>{getJobDataLabel(record)}</span>
        <span className={`badge ${isExact(record) ? "exact" : "estimated"}`}>{LOCATION_LABELS[job.locationAccuracy]}</span>
        <span className={`badge ${job.postingStatus === "closing_soon" ? "closing" : ""}`}>{POSTING_STATUS_LABELS[job.postingStatus]}</span>
        {job.categories.map((category) => <span className="badge" key={category}>{category}</span>)}
        {job.employmentTypes.map((type) => <span className="badge" key={type}>{type}</span>)}
      </div>
      <div className="job-primary">
        <div>
          <div className="salary">{job.salary.originalText || "급여 미확인"}
            {monthly !== null && <span className="normalized">월 환산 예상 {formatWon(monthly)} · 신뢰도 {job.salary.normalizationConfidence ? SALARY_CONFIDENCE_LABELS[job.salary.normalizationConfidence] : "미정"}</span>}
          </div>
          <div className="detail-line"><strong>근무</strong> {job.workDaysOriginalText ?? "요일 미확인"} · {hours}</div>
          <div className="detail-line"><strong>조건</strong> {job.experienceRequirement ?? "경력 미확인"} · {job.educationRequirement ?? "학력 미확인"}</div>
        </div>
        <div>
          <div className="detail-line"><strong>위치</strong> {job.addressOriginalText ?? "위치정보 없음"}</div>
          {administrativeArea && <div className="detail-line"><strong>행정구역</strong> {administrativeArea}</div>}
          {job.nearestStation && <div className="detail-line"><strong>인근역</strong> {job.nearestStation}</div>}
          <div className="detail-line"><strong>거리</strong> {distance === null ? "좌표 없음" : `${distance.toFixed(1)}km`} · 직선거리</div>
          <div className="detail-line"><strong>등록</strong> {formatDate(job.postedAt)} · <strong>마감</strong> {formatDate(job.expiresAt)}</div>
        </div>
      </div>
      <div className="job-actions">
        {record.safeSourceUrl ? <a className="action-link" href={record.safeSourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${job.title} 원문 새 창에서 보기`}>원문 보기 ↗</a>
          : <span className="detail-line">{record.isFictional ? "가상 공고 · 원문 없음" : "안전한 원문 URL 없음"}</span>}
        <button type="button" className="action-button" disabled={!record.mapPosition} onClick={onMapFocus} aria-label={`${job.title} 지도에서 보기`}>
          {record.mapPosition ? "지도에서 보기" : "지도 좌표 없음"}
        </button>
        <label className="sr-only" htmlFor={`status-${job.id}`}>사용자 상태</label>
        <select id={`status-${job.id}`} className="status-select" value={userStatus} onChange={(event) => onUserStatusChange(event.target.value as UserJobStatus)}>
          {Object.entries(USER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </article>
  );
}
