"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionRunSnapshot, RecentCollectionRun } from "../../server/collection-control/contracts";
import type { CollectionPreset } from "../../sources/collection/collection-presets";
import { canonicalizeExclusionConfig, DEFAULT_EXCLUSION_FIELDS, EXCLUSION_FIELDS, normalizeCollectionExclusionConfig, splitExclusionKeywordInput, type CollectionExclusionConfig, type ExclusionField } from "../../services/collection-exclusion";
import { loadCollectionExclusionPreferences, saveCollectionExclusionPreferences } from "../../repositories/collection-exclusion-preferences";

interface Props { enabled: boolean; presets: CollectionPreset[] }
type ApiError = { error?: { message?: string } };
const terminal = (run: CollectionRunSnapshot | null) => run?.status === "completed" || run?.status === "failed";

export function CollectionControl({ enabled, presets }: Props) {
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "seoul-ai");
  const preset = useMemo(() => presets.find((item) => item.id === selectedId) ?? presets[0]!, [presets, selectedId]);
  const [pages, setPages] = useState<number>(preset.pages); const [maxDetails, setMaxDetails] = useState<number>(preset.maxDetails);
  const [run, setRun] = useState<CollectionRunSnapshot | null>(null); const [error, setError] = useState<string | null>(null);
  const [confirmingDryRun, setConfirmingDryRun] = useState(false); const [writePhrase, setWritePhrase] = useState("");
  const [history, setHistory] = useState<RecentCollectionRun[]>([]);
  const [exclusion, setExclusion] = useState<CollectionExclusionConfig>({ keywords: [], fields: DEFAULT_EXCLUSION_FIELDS });
  const [keywordInput, setKeywordInput] = useState(""); const [exclusionError, setExclusionError] = useState<string | null>(null);
  const busy = Boolean(run && !terminal(run));
  const expectedPhrase = `WRITE ${preset.id}`;
  const writeReady = Boolean(run?.mode === "dry_run" && run.status === "completed" && run.writeAuthorizationToken && run.presetId === preset.id
    && run.listingPagesRequested === pages && run.maxDetailsRequested === maxDetails
    && canonicalizeExclusionConfig(run.exclusion ?? { keywords: [], fields: [] }) === canonicalizeExclusionConfig(exclusion));

  useEffect(() => { const saved = loadCollectionExclusionPreferences(window.localStorage); setExclusion(saved.keywords.length ? saved : { keywords: [], fields: DEFAULT_EXCLUSION_FIELDS }); }, []);
  useEffect(() => { saveCollectionExclusionPreferences(window.localStorage, exclusion); }, [exclusion]);

  const loadHistory = useCallback(async () => { if (!enabled) return; const response = await fetch("/api/collection-runs/recent", { cache: "no-store" }); if (response.ok) setHistory((await response.json()).runs ?? []); }, [enabled]);
  useEffect(() => { void loadHistory(); if (!enabled) return; void fetch("/api/collection-runs/active", { cache: "no-store" }).then(async (response) => {
    if (response.ok) { const active = (await response.json()).run as CollectionRunSnapshot | null; if (active) { setRun(active); setSelectedId(active.presetId); setPages(active.listingPagesRequested); setMaxDetails(active.maxDetailsRequested); setExclusion(active.exclusion ?? { keywords: [], fields: [] }); } }
  }); }, [enabled, loadHistory]);
  useEffect(() => { if (!busy || !run) return; const timer = window.setInterval(async () => { const response = await fetch(`/api/collection-runs/${run.runId}`, { cache: "no-store" });
    if (response.status === 404) { setError("실행 상태를 찾을 수 없습니다. 서버가 재시작되었을 수 있습니다."); setRun(null); window.clearInterval(timer); return; }
    if (response.ok) { const next = (await response.json()).run as CollectionRunSnapshot; setRun(next); if (terminal(next)) { window.clearInterval(timer); void loadHistory(); } }
  }, 750); return () => window.clearInterval(timer); }, [busy, run, loadHistory]);
  useEffect(() => { if (!busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [busy]);

  const choosePreset = (next: CollectionPreset) => { setSelectedId(next.id); setPages(next.pages); setMaxDetails(next.maxDetails); setRun(null); setWritePhrase(""); setError(null); };
  const changeConfig = (kind: "pages" | "details", value: number) => { if (kind === "pages") setPages(value); else setMaxDetails(value); setRun(null); setWritePhrase(""); };
  const changeExclusion = (next: CollectionExclusionConfig) => { setExclusion(next); setRun(null); setWritePhrase(""); setExclusionError(null); };
  const addKeywords = (raw: string) => { try { const next = normalizeCollectionExclusionConfig({ keywords: [...exclusion.keywords, ...splitExclusionKeywordInput(raw)], fields: exclusion.fields }); changeExclusion(next); setKeywordInput(""); }
    catch (cause) { setExclusionError(cause instanceof Error ? cause.message : "제외 키워드를 추가할 수 없습니다."); } };
  const start = async (mode: "dry_run" | "write") => {
    setError(null); const payload: Record<string, unknown> = { presetId: preset.id, pages, maxDetails, mode, exclusion };
    if (mode === "write") { payload.writeAuthorizationToken = run?.writeAuthorizationToken; payload.confirmationPhrase = writePhrase; }
    const response = await fetch("/api/collection-runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as CollectionRunSnapshot & ApiError; if (!response.ok) { setError(body.error?.message ?? "수집을 시작하지 못했습니다."); return; }
    setRun(body); setConfirmingDryRun(false); if (mode === "write") setWritePhrase("");
  };

  if (!enabled) return <section className="collection-disabled" role="status"><h2>수집 관리 비활성화</h2><p>로컬 서버를 <code>NEARBY_JOBS_ENABLE_COLLECTION_UI=1</code>로 시작해야 합니다. 공개 환경에서는 기본적으로 실행할 수 없습니다.</p></section>;
  return <div className="collection-control" aria-busy={busy}>
    {error && <div className="collection-error" role="alert">{error}</div>}
    <section aria-labelledby="preset-heading"><div className="section-heading"><h2 id="preset-heading">1. 프리셋 선택</h2><span className="badge">수동 실행</span></div>
      <div className="preset-grid" role="radiogroup" aria-label="수집 프리셋">{presets.map((item) => <button key={item.id} type="button" role="radio" aria-checked={item.id === preset.id}
        className={`preset-card ${item.id === preset.id ? "selected" : ""}`} onClick={() => choosePreset(item)} disabled={busy}>
        <strong>{item.label}</strong><span className={`badge source-${item.source}`}>{item.source === "albamon" ? "알바몬" : "잡코리아"}</span>
        <span>{item.source === "albamon" ? "오늘 등록 · 목록 정보" : `키워드 ${item.keyword}`}</span><span>{item.regions.map((r) => r === "seoul" ? "서울" : "경기").join(" + ")}</span>
        <small>기본 {item.pages}페이지 · 후보 {item.maxDetails}건 · 수동 실행 · 재시도 0</small></button>)}</div>
    </section>
    <section className="collection-panel" aria-labelledby="config-heading"><h2 id="config-heading">2. 실행 범위</h2><div className="limit-grid">
      <label>목록 페이지<input type="number" min="1" max={preset.pages} value={pages} disabled={busy} onChange={(e) => changeConfig("pages", Number(e.target.value))} /></label>
      <label>최대 후보 수<input type="number" min="1" max={preset.maxDetails} value={maxDetails} disabled={busy} onChange={(e) => changeConfig("details", Number(e.target.value))} /></label></div>
      <dl className="resolved-config"><div><dt>소스</dt><dd>{preset.source === "albamon" ? "알바몬" : "잡코리아"}</dd></div><div><dt>프리셋</dt><dd>{preset.label}</dd></div><div><dt>지역</dt><dd>{preset.regions.map((r) => r === "seoul" ? "서울" : "경기").join(" + ")}</dd></div><div><dt>동시성</dt><dd>{preset.source === "albamon" ? "상세 요청 없음" : "2"}</dd></div><div><dt>재시도</dt><dd>0</dd></div></dl>
      <ExclusionControls config={exclusion} input={keywordInput} error={exclusionError} disabled={busy} onInput={setKeywordInput} onAdd={addKeywords} onChange={changeExclusion} />
      {!confirmingDryRun ? <button type="button" className="button primary collection-primary" disabled={busy || pages < 1 || pages > preset.pages || maxDetails < 1 || maxDetails > preset.maxDetails} onClick={() => setConfirmingDryRun(true)}>드라이런 실행</button>
        : <div className="inline-confirm" role="group" aria-label="드라이런 확인"><p><strong>{preset.label}</strong> · {pages}페이지 · 후보 {maxDetails}건<br />데이터베이스 쓰기: 없음</p><button className="button primary" onClick={() => void start("dry_run")}>확인하고 실행</button><button className="button soft" onClick={() => setConfirmingDryRun(false)}>취소</button></div>}
    </section>
    {run && <RunProgress run={run} />}
    {run?.status === "completed" && run.result && <ResultSummary run={run} />}
    {writeReady && <section className="collection-panel write-panel" aria-labelledby="write-heading"><h2 id="write-heading">3. 실제 수집 실행</h2>
      <p>한 ingestion run을 만들고 최대 {maxDetails}건을 반영합니다. 상세 확인 데이터는 목록 정보로 낮아지지 않으며 권한 상태는 미확인입니다.</p>
      <label htmlFor="write-phrase">확인 문구 <code id="write-instruction">{expectedPhrase}</code><input id="write-phrase" aria-describedby="write-instruction" autoComplete="off" value={writePhrase} onChange={(e) => setWritePhrase(e.target.value)} /></label>
      <button type="button" className="button danger" disabled={writePhrase !== expectedPhrase || busy} onClick={() => void start("write")}>실제 수집 실행</button></section>}
    {run?.mode === "write" && run.status === "completed" && <div className="result-actions"><Link href="/" className="button primary">목록에서 결과 보기</Link><button type="button" className="button soft" onClick={() => { setRun(null); setWritePhrase(""); }}>같은 설정으로 다시 드라이런</button></div>}
    <RecentRuns runs={history} />
  </div>;
}

const EXCLUSION_FIELD_LABELS: Record<ExclusionField, string> = { title: "공고명", company: "회사명", location: "지역", category: "직종·카테고리", employment_type: "고용형태", work_schedule: "근무 일정" };

function ExclusionControls({ config, input, error, disabled, onInput, onAdd, onChange }: { config: CollectionExclusionConfig; input: string; error: string | null; disabled: boolean; onInput(value: string): void; onAdd(value: string): void; onChange(value: CollectionExclusionConfig): void }) {
  const toggle = (field: ExclusionField) => { const fields = config.fields.includes(field) ? config.fields.filter((item) => item !== field) : [...config.fields, field]; if (config.keywords.length && !fields.length) return; onChange({ ...config, fields }); };
  return <fieldset className="exclusion-controls" disabled={disabled}><legend>제외 키워드</legend>
    <p>입력한 단어가 선택한 항목에 포함된 공고는 후보 수 제한을 적용하기 전에 제외됩니다.</p>
    <div className="exclusion-entry"><label htmlFor="collection-exclusion-input">키워드 (쉼표 또는 줄바꿈 가능)</label><textarea id="collection-exclusion-input" value={input} onChange={(event) => onInput(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (/[,\r\n]/u.test(pasted)) { event.preventDefault(); onAdd(pasted); } }} /><button type="button" className="button soft" onClick={() => onAdd(input)} disabled={!input.trim()}>추가</button></div>
    <div className="keyword-chip-list" aria-live="polite">{config.keywords.map((keyword) => <span className="keyword-chip" key={keyword}>{keyword}<button type="button" aria-label={`${keyword} 제외 키워드 제거`} onClick={() => onChange({ ...config, keywords: config.keywords.filter((item) => item !== keyword), fields: config.keywords.length === 1 ? [] : config.fields })}>×</button></span>)}<span>{config.keywords.length}/30</span></div>
    <div className="exclusion-fields">{EXCLUSION_FIELDS.map((field) => <label key={field}><input type="checkbox" checked={config.fields.includes(field)} onChange={() => toggle(field)} /> {EXCLUSION_FIELD_LABELS[field]}</label>)}</div>
    <button type="button" className="button compact" onClick={() => onChange({ keywords: [], fields: [] })} disabled={!config.keywords.length}>모두 지우기</button>
    {error && <p className="collection-error" role="alert">{error}</p>}
  </fieldset>;
}

function RunProgress({ run }: { run: CollectionRunSnapshot }) { const percent = run.detailAttemptsTotal ? Math.round(run.detailAttemptsCompleted / run.detailAttemptsTotal * 100) : run.listingPagesRequested ? Math.max(10, Math.round(run.listingPagesCompleted / run.listingPagesRequested * 100)) : run.status === "completed" ? 100 : 10;
  return <section className="collection-panel progress-panel" aria-live="polite"><div className="section-heading"><h2>{run.mode === "write" ? "실제 수집 진행" : "드라이런 진행"}</h2><span>{run.message}</span></div>
    <progress max="100" value={percent}>{percent}%</progress><p>목록 {run.listingPagesCompleted}/{run.listingPagesRequested} · 제외 {run.candidatesExcluded ?? 0}건 · 최종 후보 {run.selectedCandidates}건 · {run.source === "albamon" ? "상세 요청 없음" : `상세 ${run.detailAttemptsCompleted}/${run.detailAttemptsTotal}`} · 경과 {(run.elapsedMs / 1000).toFixed(1)}초</p>
    {run.error && <p className="collection-error" role="alert">{run.error.message}</p>}</section>; }

function ResultSummary({ run }: { run: CollectionRunSnapshot }) { const r = run.result!; const items = run.mode === "dry_run" ? [["완료 페이지", r.listingPagesCompleted], ["숫자 링크", r.numericLinksExtracted], ["고유 ID", r.uniquePostingIds], ["서울 후보", r.seoulMatches], ["경기 후보", r.gyeonggiMatches], ["지역 미확인", r.unknownRegionCandidates], ["제외 전 후보", r.candidatesBeforeExclusion], ["제외된 공고", r.candidatesExcluded], ["제외 후 후보", r.candidatesAfterExclusion], ["선택 후보", r.candidatesSelected], ["상세 성공", r.successfullyParsed], ["로그인·차단 상세", r.blockedDetails], ["목록 정보 대체", r.listingOnlyRecords], ["예상 삽입", r.predictedInserts], ["예상 갱신", r.predictedUpdates], ["예상 동일", r.predictedUnchanged], ["낮은 완성도 건너뜀", r.predictedLowerCompletenessSkips]]
    : [["삽입", r.actualInserts], ["갱신", r.actualUpdates], ["동일", r.actualUnchanged], ["낮은 완성도 건너뜀", r.actualLowerCompletenessSkips], ["실패", r.failedRecords], ["전체 공고", r.totalSqliteJobs], ["ingestion run", r.runId ?? "-"]];
  return <section className="collection-panel"><h2>{run.mode === "dry_run" ? "드라이런 결과" : "쓰기 결과"}</h2><div className="summary-grid">{items.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {r.candidatesExcluded > 0 && <div className="exclusion-summary"><h3>제외 결과</h3><ul>{Object.entries(r.exclusionReasonCounts.byKeyword).map(([keyword, count]) => <li key={`keyword-${keyword}`}>{keyword}: {count}</li>)}{Object.entries(r.exclusionReasonCounts.byField).map(([field, count]) => <li key={`field-${field}`}>{EXCLUSION_FIELD_LABELS[field as ExclusionField]}: {count}</li>)}</ul>
      <p>{r.excludedCandidateSamples.map((sample) => `${sample.postingId}(${sample.matchedKeyword}/${EXCLUSION_FIELD_LABELS[sample.matchedField]})`).join(", ")}{r.exclusionSamplesTruncated ? " …" : ""}</p></div>}
    {run.mode === "dry_run" && <p className="safe-notice">드라이런에서는 데이터베이스를 변경하지 않았습니다.</p>}</section>; }

function RecentRuns({ runs }: { runs: RecentCollectionRun[] }) { return <section className="collection-panel"><h2>최근 실제 수집</h2>{!runs.length ? <p>기록된 실제 수집이 없습니다.</p> : <div className="recent-run-list">{runs.map((run) => <article key={run.id}><div><strong>{run.presetLabel}</strong><time>{new Date(run.startedAt).toLocaleString("ko-KR")}</time></div><p>시도 {run.attempted} · 삽입 {run.inserted} · 갱신 {run.updated} · 동일 {run.unchanged} · 실패 {run.failed}</p><span className={`badge source-${run.source}`}>{run.source === "albamon" ? "알바몬" : "잡코리아"}</span><span className="badge">{run.status}</span></article>)}</div>}</section>; }
