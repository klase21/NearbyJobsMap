"use client";

import { useCallback, useEffect, useState } from "react";
import type { CollectionRunSnapshot } from "../../server/collection-control/contracts";
import type { CollectionDashboardData, CollectionDashboardFilters, CollectionRunDetail } from "../../server/collection-dashboard/contracts";
import type { CollectionPreset } from "../../sources/collection/collection-presets";
import { CollectionControl } from "./CollectionControl";
import { ProfileComparisonPanel } from "./ProfileComparisonPanel";

interface Props { enabled: boolean; presets: CollectionPreset[] }
type View = "overview" | "compare" | "execution";
const DEFAULT_FILTERS: CollectionDashboardFilters = { period: "30d", source: "all", status: "all" };

export function CollectionDashboard({ enabled, presets }: Props) {
  const [view, setView] = useState<View>("overview");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dashboard, setDashboard] = useState<CollectionDashboardData | null>(null);
  const [activeRun, setActiveRun] = useState<CollectionRunSnapshot | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [comparisonRefreshKey, setComparisonRefreshKey] = useState(0);
  const loadDashboard = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ period: filters.period, source: filters.source, status: filters.status }); const response = await fetch(`/api/collection-dashboard?${query}`, { cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "대시보드를 불러오지 못했습니다.");
      setDashboard(body.dashboard);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "대시보드를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [enabled, filters]);
  const loadActive = useCallback(async () => {
    if (!enabled) return;
    try { const response = await fetch("/api/collection-runs/active", { cache: "no-store" }); if (response.ok) setActiveRun((await response.json()).run ?? null); }
    catch { /* The execution panel displays actionable run errors. */ }
  }, [enabled]);
  const handleWriteCompleted = useCallback(() => { void loadDashboard(); void loadActive(); setComparisonRefreshKey((value) => value + 1); }, [loadDashboard, loadActive]);
  const handleRunChange = useCallback((run: CollectionRunSnapshot | null) => setActiveRun(run), []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { void loadActive(); }, [loadActive]);
  useEffect(() => { if (!activeRun) return; const timer = window.setInterval(() => void loadActive(), 750); return () => window.clearInterval(timer); }, [activeRun, loadActive]);
  useEffect(() => { if (view === "overview") void loadDashboard(); }, [view, loadDashboard]);
  useEffect(() => { const tab = new URLSearchParams(window.location.search).get("tab"); if (tab === "compare") setView("compare"); else if (tab === "execution") setView("execution"); }, []);

  const changeView = (next: View) => { setView(next); const query = new URLSearchParams(window.location.search); if (next === "overview") query.delete("tab"); else query.set("tab", next); window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`); };

  return <div className="collection-dashboard-shell">
    <div className="collection-tabs" role="tablist" aria-label="수집 관리 보기">
      <button id="overview-tab" role="tab" aria-selected={view === "overview"} aria-controls="overview-panel" className={view === "overview" ? "active" : ""} onClick={() => changeView("overview")}>개요</button>
      <button id="compare-tab" role="tab" aria-selected={view === "compare"} aria-controls="compare-panel" className={view === "compare" ? "active" : ""} onClick={() => changeView("compare")}>프로필 비교</button>
      <button id="execution-tab" role="tab" aria-selected={view === "execution"} aria-controls="execution-panel" className={view === "execution" ? "active" : ""} onClick={() => changeView("execution")}>수집 실행</button>
    </div>
    {activeRun && <ActiveRunBanner run={activeRun} onOpen={() => changeView("execution")} />}
    {view === "overview" ? <section id="overview-panel" role="tabpanel" aria-labelledby="overview-tab" aria-busy={loading}>
      {!enabled ? <section className="collection-disabled" role="status"><h2>수집 현황 비활성화</h2><p>로컬 서버를 <code>NEARBY_JOBS_ENABLE_COLLECTION_UI=1</code>로 시작하면 읽기 전용 현황을 볼 수 있습니다.</p></section>
        : <CollectionOverview dashboard={dashboard} filters={filters} loading={loading} error={error} onFilters={setFilters} onRefresh={loadDashboard} />}
    </section> : view === "compare" ? <section id="compare-panel" role="tabpanel" aria-labelledby="compare-tab">
      <ProfileComparisonPanel enabled={enabled} activeRun={activeRun} refreshKey={comparisonRefreshKey} onOpenExecution={() => changeView("execution")} />
    </section> : <section id="execution-panel" role="tabpanel" aria-labelledby="execution-tab">
      <CollectionControl enabled={enabled} presets={presets} onWriteCompleted={handleWriteCompleted} onRunChange={handleRunChange} />
    </section>}
  </div>;
}

function ActiveRunBanner({ run, onOpen }: { run: CollectionRunSnapshot; onOpen(): void }) {
  const source = run.source === "albamon" ? "알바몬" : "잡코리아";
  return <aside className="active-run-banner" aria-live="polite"><div><strong>실행 중 · {source} · {run.presetLabel}</strong><p>{run.mode === "write" ? "실제 수집" : "드라이런"} · {run.message} · 목록 {run.listingPagesCompleted}/{run.listingPagesRequested} · 후보 {run.selectedCandidates}건 · {(run.elapsedMs / 1000).toFixed(1)}초</p></div><button className="button soft" onClick={onOpen}>실행 화면으로 이동</button></aside>;
}

function CollectionOverview({ dashboard, filters, loading, error, onFilters, onRefresh }: { dashboard: CollectionDashboardData | null; filters: CollectionDashboardFilters; loading: boolean; error: string | null; onFilters(value: CollectionDashboardFilters): void; onRefresh(): Promise<void> }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null); const [detail, setDetail] = useState<CollectionRunDetail | null>(null); const [detailError, setDetailError] = useState<string | null>(null);
  const selectRun = async (runId: string) => { setSelectedRunId(runId); setDetail(null); setDetailError(null); const response = await fetch(`/api/collection-dashboard/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }); const body = await response.json(); if (response.ok) setDetail(body.run); else setDetailError(body.error?.message ?? "실행 상세를 불러오지 못했습니다."); };
  return <div className="collection-overview">
    <div className="dashboard-toolbar"><div><h2>수집 현황</h2><p>저장된 공고와 최근 수집 결과를 소스별로 확인합니다.</p></div><button type="button" className="button soft" aria-label="수집 현황 새로고침" disabled={loading} onClick={() => void onRefresh()}>새로고침</button></div>
    <fieldset className="dashboard-filters"><legend>실행 분석 필터</legend><label>기간<select value={filters.period} onChange={(event) => onFilters({ ...filters, period: event.target.value as CollectionDashboardFilters["period"] })}><option value="7d">최근 7일</option><option value="30d">최근 30일</option><option value="all">전체</option></select></label><label>소스<select value={filters.source} onChange={(event) => onFilters({ ...filters, source: event.target.value as CollectionDashboardFilters["source"] })}><option value="all">전체</option><option value="jobkorea">잡코리아</option><option value="albamon">알바몬</option></select></label><label>실행 상태<select value={filters.status} onChange={(event) => onFilters({ ...filters, status: event.target.value as CollectionDashboardFilters["status"] })}><option value="all">전체</option><option value="completed">완료</option><option value="failed">실패</option></select></label><p>필터는 실행 분석과 최근 기록에만 적용됩니다. 현재 재고는 전체 DB 기준입니다.</p></fieldset>
    {error && <p className="collection-error" role="alert">{error}</p>}{loading && !dashboard && <p role="status">수집 현황을 불러오는 중입니다.</p>}
    {dashboard && <>
      <DashboardSection title="전체 재고" description="provenance 관찰 수가 아니라 현재 SQLite 공고 행을 한 번씩 셉니다."><MetricGrid items={[
        ["전체 공고", dashboard.inventory.totalJobs], ["잡코리아", dashboard.inventory.jobkoreaJobs], ["알바몬", dashboard.inventory.albamonJobs], ["픽스처", dashboard.inventory.fixtureRecords], ["가상 데모", dashboard.inventory.fictionalRecords], ["수동 수집", dashboard.inventory.manuallyCollectedRecords], ["목록 정보", dashboard.inventory.listingOnlyRecords], ["상세 확인", dashboard.inventory.detailCompleteRecords], ["완성도 미상", dashboard.inventory.completenessUnknownRecords], ["지도 표시 가능", dashboard.inventory.mapEligibleRecords], ["목록만", dashboard.inventory.listOnlyRecords]
      ]} /></DashboardSection>
      {dashboard.profiles && <DashboardSection title="저장된 수집 프로필" description="프로필은 실행 설정이며 공고 또는 수집 이력과 별도로 집계합니다."><MetricGrid items={[["전체",dashboard.profiles.total],["잡코리아",dashboard.profiles.jobkorea],["알바몬",dashboard.profiles.albamon],["즐겨찾기",dashboard.profiles.favorites],["최근 30일 사용",dashboard.profiles.usedLast30Days]]}/>{dashboard.profiles.recent.length?<div className="recent-profile-list">{dashboard.profiles.recent.map(profile=><article key={profile.id}><strong>{profile.isFavorite?"★ ":""}{profile.name}</strong><span className={`badge source-${profile.source}`}>{profile.source==="jobkorea"?"잡코리아":"알바몬"}</span><small>{profile.lastUsedAt?new Date(profile.lastUsedAt).toLocaleString("ko-KR"):"사용 기록 없음"}</small><button className="button compact" onClick={()=>document.getElementById("execution-tab")?.click()}>수집 실행으로 이동</button></article>)}</div>:<p>저장된 프로필이 없습니다.</p>}</DashboardSection>}
      <DashboardSection title="소스 현황"><div className="source-overview-grid">{dashboard.sources.map((source) => <article className="source-overview-card" key={source.source}><div className="section-heading"><h4>{source.source === "jobkorea" ? "잡코리아" : "알바몬"}</h4><span className={`badge source-${source.source}`}>{source.storedJobs}건</span></div><dl><div><dt>수동 수집</dt><dd>{source.manuallyCollected}</dd></div><div><dt>픽스처</dt><dd>{source.fixture}</dd></div><div><dt>목록 / 상세 / 미상</dt><dd>{source.listingOnly} / {source.detailComplete} / {source.completenessUnknown}</dd></div><div><dt>지도 표시</dt><dd>{source.mapEligible}</dd></div><div><dt>최근 관찰</dt><dd>{dateOrUnknown(source.latestObservedAt)}</dd></div><div><dt>최근 쓰기</dt><dd>{source.latestRun ? `${statusLabel(source.latestRun.status)} · ${source.latestRun.presetLabel ?? "이전 형식"}` : "실행 기록 없음"}</dd></div></dl></article>)}</div></DashboardSection>
      <div className="dashboard-two-column"><DashboardSection title="지역 범위"><CoverageList entries={[["서울", dashboard.regions.seoul], ["경기", dashboard.regions.gyeonggi], ["복수 지역", dashboard.regions.multiple], ["기타", dashboard.regions.other], ["지역 미확인", dashboard.regions.unknown]]} /></DashboardSection>
      <DashboardSection title="데이터 완성도"><CoverageList entries={dashboard.completenessBySource.map((item) => [item.source === "jobkorea" ? "잡코리아" : "알바몬", { total: item.listingOnly + item.detailComplete + item.unknown, manual: item.listingOnly + item.detailComplete }])} /><p>목록 {dashboard.inventory.listingOnlyRecords} · 상세 {dashboard.inventory.detailCompleteRecords} · 정보 없음 {dashboard.inventory.completenessUnknownRecords}</p></DashboardSection></div>
      <DashboardSection title="지도 범위"><MetricGrid items={[["좌표 있음", dashboard.mapCoverage.eligible], ["좌표 없음", dashboard.mapCoverage.listOnly], ["좌표 커버리지", percentOrUnknown(dashboard.mapCoverage.percentage)]]} /><div className="coverage-bars">{dashboard.mapCoverage.bySource.map((item) => <div key={item.source}><span>{item.source === "jobkorea" ? "잡코리아" : "알바몬"} {item.eligible}/{item.total} · {percentOrUnknown(item.percentage)}</span><progress max="100" value={item.percentage ?? 0}>{percentOrUnknown(item.percentage)}</progress></div>)}</div></DashboardSection>
      <DashboardSection title="수집 효과" description="선택한 기간·소스·상태의 persisted write run만 집계합니다."><MetricGrid items={[["실행", dashboard.effectiveness.runs], ["선택 후보", valueOrUnknown(dashboard.effectiveness.selectedCandidates)], ["상세 시도", valueOrUnknown(dashboard.effectiveness.detailAttempts)], ["상세 성공", valueOrUnknown(dashboard.effectiveness.successfulDetailParses)], ["목록 대체", valueOrUnknown(dashboard.effectiveness.listingFallbacks)], ["삽입", dashboard.effectiveness.inserted], ["갱신", dashboard.effectiveness.updated], ["동일", dashboard.effectiveness.unchanged], ["낮은 완성도 건너뜀", dashboard.effectiveness.lowerCompletenessSkips], ["실패 item", dashboard.effectiveness.failedItems], ["유효 레코드 수율", percentOrUnknown(dashboard.effectiveness.validRecordYield)], ["삽입·갱신 수율", percentOrUnknown(dashboard.effectiveness.insertUpdateYield)], ["목록 대체율", percentOrUnknown(dashboard.effectiveness.listingFallbackRate)], ["실패율", percentOrUnknown(dashboard.effectiveness.failureRate)]]} /></DashboardSection>
      <DashboardSection title="제외 키워드 영향"><MetricGrid items={[["제외 설정 실행", dashboard.exclusions.runsUsingExclusions], ["제외 전 후보", valueOrUnknown(dashboard.exclusions.candidatesBefore)], ["제외 공고", valueOrUnknown(dashboard.exclusions.candidatesExcluded)], ["제외 후 후보", valueOrUnknown(dashboard.exclusions.candidatesAfter)], ["제외율", percentOrUnknown(dashboard.exclusions.exclusionRate)]]} /><div className="exclusion-analytics"><div><h4>자주 사용한 키워드</h4>{dashboard.exclusions.topKeywords.length ? <ol>{dashboard.exclusions.topKeywords.map((item) => <li key={item.keyword}>{item.keyword} <span>{item.uses}회</span></li>)}</ol> : <p>정보 없음</p>}</div><div><h4>선택한 필드</h4>{dashboard.exclusions.fields.length ? <ul>{dashboard.exclusions.fields.map((item) => <li key={item.field}>{fieldLabel(item.field)} <span>{item.uses}회</span></li>)}</ul> : <p>정보 없음</p>}</div></div></DashboardSection>
      <DashboardSection title="최근 실제 수집" description="dry-run은 persisted write history에 포함하지 않습니다.">{dashboard.recentRuns.length ? <div className="dashboard-run-table-wrap"><table className="dashboard-run-table"><thead><tr><th>시작</th><th>소스</th><th>프리셋·프로필</th><th>상태</th><th>선택</th><th>삽입</th><th>갱신</th><th>동일</th><th>실패</th><th>제외</th><th>시간</th></tr></thead><tbody>{dashboard.recentRuns.map((run) => <tr key={run.id} className={selectedRunId === run.id ? "selected" : ""}><td><button type="button" aria-pressed={selectedRunId === run.id} onClick={() => void selectRun(run.id)}>{new Date(run.startedAt).toLocaleString("ko-KR")}</button></td><td><span className={`badge source-${run.source}`}>{run.source === "jobkorea" ? "잡코리아" : "알바몬"}</span></td><td>{run.savedProfile?`${run.savedProfile.name}${run.savedProfile.deleted?" · 프로필 삭제됨":""}`:run.presetLabel??"기본 프리셋 직접 실행"}</td><td>{statusLabel(run.status)}</td><td>{valueOrUnknown(run.selectedCandidates)}</td><td>{run.inserted}</td><td>{run.updated}</td><td>{run.unchanged}</td><td>{run.failed}</td><td>{valueOrUnknown(run.excluded)}</td><td>{durationOrUnknown(run.durationMs)}</td></tr>)}</tbody></table></div> : <p className="dashboard-empty">조건에 맞는 실제 수집 기록이 없습니다.</p>}</DashboardSection>
      {(selectedRunId || detailError) && <RunDetailPanel detail={detail} error={detailError} />}
    </>}
  </div>;
}

function DashboardSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="collection-panel dashboard-section"><div className="dashboard-section-heading"><h3>{title}</h3>{description && <p>{description}</p>}</div>{children}</section>; }
function MetricGrid({ items }: { items: Array<[string, string | number]> }) { return <div className="dashboard-metric-grid">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>; }
function CoverageList({ entries }: { entries: Array<[string, { total: number; manual: number }]> }) { return <dl className="coverage-list">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>전체 {value.total} · 수동 {value.manual}</dd></div>)}</dl>; }
function RunDetailPanel({ detail, error }: { detail: CollectionRunDetail | null; error: string | null }) { if (error) return <section className="collection-panel" role="alert"><h3>실행 상세</h3><p className="collection-error">{error}</p></section>; if (!detail) return <section className="collection-panel" aria-busy="true"><h3>실행 상세</h3><p>불러오는 중입니다.</p></section>; const values: Array<[string, string | number]> = [["run ID", detail.id], ["소스", detail.source === "jobkorea" ? "잡코리아" : "알바몬"], ["프리셋 ID", detail.presetId ?? "정보 없음"], ["프리셋", detail.presetLabel ?? "이전 형식"], ["저장 프로필", detail.savedProfile?`${detail.savedProfile.name} · r${detail.savedProfile.revision}${detail.savedProfile.deleted?" · 프로필 삭제됨":""}`:"기본 프리셋 직접 실행"], ["구성 hash", detail.savedProfile?detail.savedProfile.configurationHash.slice(0,12):"정보 없음"], ["키워드", detail.keyword ?? "정보 없음"], ["요청 지역", detail.requestedRegions?.join(", ") || "정보 없음"], ["페이지", valueOrUnknown(detail.pages)], ["최대 후보", valueOrUnknown(detail.maxCandidates)], ["제외 키워드", detail.exclusionKeywords?.join(", ") || "정보 없음"], ["제외 필드", detail.exclusionFields?.map(fieldLabel).join(", ") || "정보 없음"], ["제외 전", valueOrUnknown(detail.candidatesBeforeExclusion)], ["제외", valueOrUnknown(detail.excluded)], ["선택", valueOrUnknown(detail.selectedCandidates)], ["상세 시도", valueOrUnknown(detail.detailAttempts)], ["상세 성공", valueOrUnknown(detail.successfulDetailParses)], ["목록 대체", valueOrUnknown(detail.listingFallbacks)], ["삽입", detail.inserted], ["갱신", detail.updated], ["동일", detail.unchanged], ["건너뜀", detail.skipped], ["실패", detail.failed], ["시작", new Date(detail.startedAt).toLocaleString("ko-KR")], ["완료", dateOrUnknown(detail.completedAt)], ["소요", durationOrUnknown(detail.durationMs)], ["권한", detail.permissionStatus ?? "정보 없음"], ["provenance", detail.provenanceType ?? "정보 없음"]]; return <section className="collection-panel run-detail-panel" aria-live="polite"><h3>선택한 실행 상세</h3><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h4>실패 요약</h4>{detail.failureSummaries.length ? <ul>{detail.failureSummaries.map((item) => <li key={item.category}>{failureLabel(item.category)}: {item.count}</li>)}</ul> : <p>기록된 실패 item이 없습니다.</p>}</section>; }

const valueOrUnknown = (value: number | null): string | number => value === null ? "정보 없음" : value;
const percentOrUnknown = (value: number | null): string => value === null ? "정보 없음" : `${value}%`;
const dateOrUnknown = (value: string | null): string => value ? new Date(value).toLocaleString("ko-KR") : "정보 없음";
const durationOrUnknown = (value: number | null): string => value === null ? "정보 없음" : `${(value / 1000).toFixed(1)}초`;
const statusLabel = (value: string): string => ({ completed: "완료", partial: "부분 완료", failed: "실패", blocked: "차단", running: "실행 중" }[value] ?? "정보 없음");
const fieldLabel = (value: string): string => ({ title: "공고명", company: "회사명", location: "지역", category: "직종·카테고리", employment_type: "고용형태", work_schedule: "근무 일정" }[value] ?? value);
const failureLabel = (value: string): string => ({ access_blocked: "접근 차단", verification: "검증", transport_failed: "전송 실패", parse_failed: "파싱 실패", invalid_detail: "잘못된 상세", other: "기타" }[value] ?? value);
