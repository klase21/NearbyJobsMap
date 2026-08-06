"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionRunSnapshot } from "../../server/collection-control/contracts";
import type { ProfileComparisonPeriod, ProfileComparisonRevisionScope, SavedProfileComparisonResult } from "../../server/collection-profile-comparison/contracts";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";

interface Props { enabled: boolean; activeRun: CollectionRunSnapshot | null; refreshKey: number; onOpenExecution(): void }

export function ProfileComparisonPanel({ enabled, activeRun, refreshKey, onOpenExecution }: Props) {
  const [profiles, setProfiles] = useState<SavedCollectionProfile[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(""); const [source, setSource] = useState<"all" | "jobkorea" | "albamon">("all"); const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [period, setPeriod] = useState<ProfileComparisonPeriod>("30d"); const [revisionScope, setRevisionScope] = useState<ProfileComparisonRevisionScope>("current");
  const [comparison, setComparison] = useState<SavedProfileComparisonResult | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    if (!enabled) return;
    const response = await fetch("/api/collection-profiles", { cache: "no-store" }); const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "저장 프로필을 불러오지 못했습니다."); return; }
    const next = (body.profiles ?? []) as SavedCollectionProfile[]; setProfiles(next);
    setSelected((current) => { const valid = current.filter((id) => next.some((profile) => profile.id === id)).slice(0, 4); if (valid.length !== current.length) { setNotice("삭제되었거나 찾을 수 없는 프로필을 선택에서 제거했습니다."); setComparison(null); } return valid; });
  }, [enabled]);

  useEffect(() => { void loadProfiles(); }, [loadProfiles, refreshKey]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search); if (query.get("tab") !== "compare") return;
    const ids = (query.get("profiles") ?? "").split(",").filter(Boolean).slice(0, 4); setSelected([...new Set(ids)]);
    const requestedPeriod = query.get("period"); if (["7d", "30d", "all"].includes(requestedPeriod ?? "")) setPeriod(requestedPeriod as ProfileComparisonPeriod);
    const scope = query.get("revisionScope"); if (["current", "all"].includes(scope ?? "")) setRevisionScope(scope as ProfileComparisonRevisionScope);
  }, []);

  const visible = useMemo(() => profiles.filter((profile) => (!search || profile.name.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))) && (source === "all" || profile.source === source) && (!favoritesOnly || profile.isFavorite)), [profiles, search, source, favoritesOnly]);
  const selectedProfiles = selected.map((id) => profiles.find((profile) => profile.id === id)).filter((profile): profile is SavedCollectionProfile => Boolean(profile));

  const compare = useCallback(async (nextPeriod = period, nextScope = revisionScope) => {
    if (selected.length < 2 || selected.length > 4) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/collection-profile-comparison", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileIds: selected, period: nextPeriod, revisionScope: nextScope }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "프로필 비교를 불러오지 못했습니다.");
      setComparison(body.comparison);
      const query = new URLSearchParams(window.location.search); query.set("tab", "compare"); query.set("profiles", selected.join(",")); query.set("period", nextPeriod); query.set("revisionScope", nextScope); window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프로필 비교를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [period, revisionScope, selected]);

  const changePeriod = (value: ProfileComparisonPeriod) => { setPeriod(value); if (comparison) void compare(value, revisionScope); };
  const changeScope = (value: ProfileComparisonRevisionScope) => { setRevisionScope(value); if (comparison) void compare(period, value); };
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current);

  if (!enabled) return <section className="collection-disabled" role="status"><h2>프로필 비교 비활성화</h2><p>로컬 수집 관리 기능을 활성화해야 저장 프로필을 비교할 수 있습니다.</p></section>;
  return <div className="profile-comparison" aria-busy={loading}>
    <header className="dashboard-toolbar"><div><h2>프로필 비교</h2><p>저장된 실행 기록과 현재 설정을 읽기 전용으로 비교합니다.</p></div><button className="button soft" onClick={() => void loadProfiles()}>프로필 새로고침</button></header>
    {notice && <p className="safe-notice" role="status">{notice}</p>}{error && <p className="collection-error" role="alert">{error}</p>}
    {profiles.length < 2 ? <section className="collection-panel dashboard-empty"><h3>프로필 비교를 사용하려면 저장된 프로필이 2개 이상 필요합니다.</h3><button className="button primary" onClick={onOpenExecution}>기본 프리셋에서 프로필 만들기</button></section> : <>
      <section className="collection-panel comparison-selector" aria-labelledby="comparison-selector-heading"><div className="section-heading"><div><h3 id="comparison-selector-heading">비교할 프로필 선택</h3><p aria-live="polite">2개 이상, 최대 4개까지 선택할 수 있습니다. 현재 {selected.length}개 선택</p></div><button className="button compact" disabled={!selected.length} onClick={() => { setSelected([]); setComparison(null); }}>선택 초기화</button></div>
        <div className="profile-toolbar"><label>프로필 이름 검색<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>소스<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">전체</option><option value="jobkorea">잡코리아</option><option value="albamon">알바몬</option></select></label><label className="check-label"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> 즐겨찾기만</label></div>
        <div className="comparison-profile-list">{visible.map((profile) => <label key={profile.id} className={`comparison-profile-option ${selected.includes(profile.id) ? "selected" : ""}`}><input type="checkbox" checked={selected.includes(profile.id)} disabled={!selected.includes(profile.id) && selected.length >= 4} onChange={() => toggle(profile.id)} /><span><strong>{profile.isFavorite ? "★ " : ""}{profile.name}</strong><small>{sourceLabel(profile.source)} · r{profile.revision} · {profile.pages}페이지 · 후보 {profile.maxCandidates}건</small></span>{activeRun?.savedProfile?.id === profile.id && <span className="badge">실행 중</span>}</label>)}</div>
        <div className="selected-profile-chips" aria-label="선택한 프로필">{selectedProfiles.map((profile) => <button key={profile.id} className="keyword-chip" onClick={() => toggle(profile.id)}>{profile.name} ×</button>)}</div>
        <div className="comparison-actions"><label>기간<select value={period} onChange={(event) => changePeriod(event.target.value as ProfileComparisonPeriod)}><option value="7d">최근 7일</option><option value="30d">최근 30일</option><option value="all">전체</option></select></label><label>리비전 범위<select value={revisionScope} onChange={(event) => changeScope(event.target.value as ProfileComparisonRevisionScope)}><option value="current">현재 리비전</option><option value="all">모든 리비전</option></select></label><button className="button primary" disabled={selected.length < 2 || loading} title={selected.length < 2 ? "프로필을 2개 이상 선택하세요." : undefined} onClick={() => void compare()}>{loading ? "비교 중" : "비교하기"}</button></div>
      </section>
      {comparison && <ComparisonResult result={comparison} />}
    </>}
  </div>;
}

function ComparisonResult({ result }: { result: SavedProfileComparisonResult }) {
  const names = new Map(result.profiles.map((profile) => [profile.id, profile.name]));
  return <div className="comparison-results" aria-live="polite">
    <p className="comparison-warning">비교 수치는 저장된 수집 실행 기록을 기준으로 하며 현재 공고 행의 최신 상태와 다를 수 있습니다.</p>
    <section className="collection-panel"><h3>현재 구성 비교</h3><div className="comparison-table-wrap" tabIndex={0} aria-label="프로필 현재 구성 비교"><table className="comparison-table"><caption>현재 저장 프로필 구성</caption><thead><tr><th>항목</th>{result.profiles.map((profile) => <th key={profile.id}><span className={`badge source-${profile.source}`}>{sourceLabel(profile.source)}</span><br />{profile.name}<br /><small>r{profile.revision} · {profile.configurationHash.slice(0, 12)}</small></th>)}</tr></thead><tbody>{result.configurationDifferences.map((difference) => <tr key={difference.field}><th>{difference.label}<span className="difference-text">{difference.same ? "동일" : "다름"}</span></th>{difference.values.map((value) => <td key={value.profileId}>{value.value}</td>)}</tr>)}<tr><th>즐겨찾기<span className="difference-text">표시 정보</span></th>{result.profiles.map((profile) => <td key={profile.id}>{profile.isFavorite ? "즐겨찾기" : "일반"}</td>)}</tr><tr><th>현재 리비전</th>{result.profiles.map((profile) => <td key={profile.id}>r{profile.revision}</td>)}</tr><tr><th>구성 hash</th>{result.profiles.map((profile) => <td key={profile.id}>{profile.configurationHash.slice(0, 12)}</td>)}</tr><tr><th>최근 사용</th>{result.profiles.map((profile) => <td key={profile.id}>{date(profile.lastUsedAt)}</td>)}</tr><tr><th>최근 수정</th>{result.profiles.map((profile) => <td key={profile.id}>{date(profile.updatedAt)}</td>)}</tr></tbody></table></div><ul className="difference-summary">{result.differenceSummary.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section className="collection-panel"><h3>제외 설정 비교</h3><div className="comparison-grid"><article><h4>공통 키워드</h4><p>{result.exclusions.commonKeywords.join(", ") || "없음"}{result.exclusions.commonKeywordsTruncated ? " · 일부만 표시" : ""}</p><h4>공통 필드</h4><p>{result.exclusions.commonFields.map(fieldLabel).join(", ") || "없음"}</p></article>{result.exclusions.uniqueKeywords.map((item) => <article key={item.profileId}><h4>{names.get(item.profileId)} 고유 키워드</h4><p>{item.keywords.join(", ") || "없음"}{item.truncated ? " · 일부만 표시" : ""}</p><p>고유 필드: {result.exclusions.uniqueFields.find((field) => field.profileId === item.profileId)?.fields.map(fieldLabel).join(", ") || "없음"}</p></article>)}</div></section>
    <section className="collection-panel"><h3>저장된 실행 성과</h3><div className="comparison-table-wrap" tabIndex={0} aria-label="프로필 실행 성과 비교"><table className="comparison-table"><caption>{result.revisionScope === "current" ? "현재 리비전" : "모든 리비전"} 쓰기 실행 성과</caption><thead><tr><th>지표</th>{result.profiles.map((profile) => <th key={profile.id}>{profile.name}</th>)}</tr></thead><tbody>{performanceRows(result).map(([label, values]) => <tr key={label}><th>{label}</th>{values.map((value, index) => <td key={result.profiles[index]!.id}>{value}</td>)}</tr>)}</tbody></table></div>{result.performance.some((item) => !item.writeRuns) && <p className="dashboard-empty">실행 기록이 없는 프로필의 성과는 정보 없음입니다.{result.revisionScope === "current" ? " 현재 리비전에는 실행 기록이 없을 수 있습니다." : ""}</p>}</section>
    <section className="collection-panel"><h3>정확한 공고 ID 중복</h3>{result.overlap.crossSourceLimited && <p className="safe-notice">서로 다른 소스의 공고는 정확한 소스 ID로만 비교하며 교차 소스 유사도는 계산하지 않습니다.</p>}<div className="comparison-table-wrap" tabIndex={0} aria-label="프로필 공고 중복 행렬"><table className="comparison-table overlap-table"><caption>같은 소스 프로필 쌍의 sourcePostingId 중복</caption><thead><tr><th>프로필 쌍</th><th>A 관찰</th><th>B 관찰</th><th>공통</th><th>A 고유</th><th>B 고유</th><th>작은 집합 중복률</th><th>Jaccard</th></tr></thead><tbody>{result.overlap.pairs.map((pair) => <tr key={`${pair.profileAId}:${pair.profileBId}`}><th>{names.get(pair.profileAId)} / {names.get(pair.profileBId)}</th>{pair.applicable ? <><td>{pair.profileAIdentities}</td><td>{pair.profileBIdentities}</td><td>{pair.sharedIdentities}</td><td>{pair.uniqueToA}</td><td>{pair.uniqueToB}</td><td>{percent(pair.overlapPercentage)}</td><td>{percent(pair.jaccardSimilarity)}</td></> : <td colSpan={7}>해당 없음</td>}</tr>)}</tbody></table></div><p>전체 공통 ID: {value(result.overlap.sharedByAll)}{result.overlap.sharedByAllSampleIds.length ? ` · 표본 ${result.overlap.sharedByAllSampleIds.join(", ")}` : ""}</p></section>
    <section className="collection-panel"><h3>최근 프로필 실행</h3><div className="comparison-grid">{result.performance.map((item) => <article key={item.profileId}><h4>{names.get(item.profileId)}</h4>{item.recentRuns.length ? <ul>{item.recentRuns.map((run) => <li key={run.id}>{new Date(run.startedAt).toLocaleString("ko-KR")} · {statusLabel(run.status)} · r{run.revision ?? "?"} · 선택 {value(run.selectedCandidates)}</li>)}</ul> : <p>실행 기록 없음</p>}</article>)}</div>{result.legacyLimitations.length > 0 && <ul>{result.legacyLimitations.map((item) => <li key={item}>{item}</li>)}</ul>}</section>
  </div>;
}

function performanceRows(result: SavedProfileComparisonResult): Array<[string, string[]]> {
  const items = result.performance; const row = (label: string, get: (item: typeof items[number]) => string) => [label, items.map(get)] as [string, string[]];
  return [row("쓰기 실행", (x) => String(x.writeRuns)), row("완료 / 실패", (x) => x.writeRuns ? `${x.completedRuns} / ${x.failedRuns}` : "정보 없음"), row("최근 상태", (x) => x.latestRunStatus ? `${statusLabel(x.latestRunStatus)} · ${date(x.latestRunAt)}` : "실행 기록 없음"), row("선택 후보", (x) => value(x.selectedCandidates)), row("제외 전 / 제외 / 제외 후", (x) => x.candidatesBeforeExclusion === null ? "정보 없음" : `${x.candidatesBeforeExclusion} / ${x.excludedCandidates} / ${x.candidatesAfterExclusion}`), row("상세 성공 / 목록 대체", (x) => x.successfulDetailParses === null || x.listingFallbacks === null ? "정보 없음" : `${x.successfulDetailParses} / ${x.listingFallbacks}`), row("삽입 / 갱신 / 동일 / 건너뜀", (x) => x.writeRuns ? `${x.inserted} / ${x.updated} / ${x.unchanged} / ${x.lowerCompletenessSkips}` : "정보 없음"), row("실패 item", (x) => x.writeRuns ? String(x.failedItems) : "정보 없음"), row("평균 시간", (x) => x.averageDurationMs === null ? "정보 없음" : `${(x.averageDurationMs / 1000).toFixed(1)}초`), row("제외율", (x) => percent(x.exclusionRate)), row("실패율", (x) => percent(x.failureRate)), row("삽입·갱신율", (x) => percent(x.insertUpdateRate)), row("유효 레코드 수율", (x) => percent(x.validRecordYield)), row("목록 대체율", (x) => percent(x.listingFallbackRate)), row("리비전 분포", (x) => x.revisionsRepresented.length ? x.revisionsRepresented.map((r) => `r${r.revision} ${r.runs}회`).join(", ") : "정보 없음"), row("현재 리비전 사용", (x) => x.currentRevisionUsed ? "있음" : "현재 리비전 실행 기록 없음")];
}

const sourceLabel = (source: string) => source === "jobkorea" ? "잡코리아" : "알바몬";
const fieldLabel = (field: string) => ({ title: "공고명", company: "회사명", location: "지역", category: "직종·카테고리", employment_type: "고용형태", work_schedule: "근무 일정" }[field] ?? field);
const value = (input: number | null) => input === null ? "정보 없음" : String(input);
const percent = (input: number | null) => input === null ? "정보 없음" : `${input}%`;
const date = (input: string | null) => input ? new Date(input).toLocaleString("ko-KR") : "정보 없음";
const statusLabel = (status: string) => ({ completed: "완료", partial: "부분 완료", failed: "실패", blocked: "차단", running: "실행 중" }[status] ?? "정보 없음");
