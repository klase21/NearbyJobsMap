"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ManualBackfillSnapshot,
  RecentManualBackfill,
} from "../../server/manual-backfill/contracts";
import {
  ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES,
  MANUAL_BACKFILL_DEFAULT_MAX_PAGES,
  MANUAL_BACKFILL_PAGE_OPTIONS,
} from "../../server/manual-backfill/validation";
import { createPreferencesRepository } from "../../repositories/preferences-repository";
import { canonicalizeExclusionConfig, canonicalizeImportedExclusionConfig, DEFAULT_EXCLUSION_FIELDS, normalizeCollectionExclusionConfig, normalizeImportedCollectionExclusionConfig, type CollectionExclusionConfig } from "../../services/collection-exclusion";
import { parseAlbamonProfileUrl, type AlbamonProfileImportPreview } from "../../services/albamon-profile-import";
import type { PersonalAlbamonProfileFile } from "../../services/personal-albamon-profile";

const stopReasonLabel = (reason: string): string => {
  if (reason === "page_limit") return "백필 미완료 — 페이지 한도 도달";
  if (reason === "cutoff_reached" || reason === "older_page") return "요청 기간 도달";
  if (reason === "source_total_exhausted") return "검색 결과 전체 확인";
  if (reason === "explicit_empty" || reason === "zero_valid_rows") return "공고 목록 종료";
  if (reason === "repeated_page") return "반복 페이지 감지";
  if (reason === "cancelled") return "사용자 중지";
  return reason;
};

export function ManualBackfillPanel({
  enabled,
  onWriteCompleted,
}: {
  enabled: boolean;
  onWriteCompleted?: () => void;
}) {
  const [source, setSource] = useState<"albamon" | "jobkorea">("albamon");
  const [range, setRange] = useState("7");
  const [since, setSince] = useState("");
  const [maxPages, setMaxPages] = useState<number>(ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES);
  const [exclusion, setExclusion] = useState<CollectionExclusionConfig>({ keywords: [], fields: [] });
  const [run, setRun] = useState<ManualBackfillSnapshot | null>(null);
  const [recent, setRecent] = useState<RecentManualBackfill[]>([]);
  const [message, setMessage] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [importPreview, setImportPreview] = useState<AlbamonProfileImportPreview | null>(null);
  const [serverProfileVerified, setServerProfileVerified] = useState(false);
  const [serverProfileHash, setServerProfileHash] = useState<string | null>(null);

  const loadRecent = useCallback(() => {
    if (!enabled) return;
    void fetch("/api/backfill-runs/recent", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body) => setRecent(body.runs))
      .catch(() => setMessage("최근 백필 기록을 불러오지 못했습니다."));
  }, [enabled]);

  useEffect(loadRecent, [loadRecent]);
  useEffect(() => {
    if (!enabled) return;
    void fetch("/api/personal-albamon-profile", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { configured?: boolean; profile?: PersonalAlbamonProfileFile | null; profileHash?: string | null };
      if (!response.ok || !body.configured || !body.profile || !body.profileHash) {
        setServerProfileVerified(false); setServerProfileHash(null); setExclusion({ keywords: [], fields: [] }); return;
      }
      const nextExclusion = normalizeImportedCollectionExclusionConfig({ keywords: body.profile.albamon.exclusions, fields: ["title", "category"] });
      setExclusion(nextExclusion); setServerProfileHash(body.profileHash); setServerProfileVerified(true);
      const repository = createPreferencesRepository(window.localStorage); const current = repository.load().value;
      repository.save({ ...current, filters: { ...current.filters, exclusionKeywords: nextExclusion.keywords, exclusionFields: nextExclusion.fields } });
    }).catch(() => { setServerProfileVerified(false); setServerProfileHash(null); setMessage("서버 개인 검색 프로필을 확인하지 못했습니다."); });
  }, [enabled]);
  useEffect(() => {
    if (!run || !["preparing", "running"].includes(run.status)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/backfill-runs/${run.id}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((body) => {
          if (!body.run) return;
          setRun(body.run);
          if (["completed", "failed", "cancelled"].includes(body.run.status)) {
            loadRecent();
            if (body.run.mode === "write" && body.run.status === "completed") onWriteCompleted?.();
          }
        })
        .catch(() => setMessage("백필 상태를 확인하지 못했습니다."));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [run, loadRecent, onWriteCompleted]);

  const start = async (mode: "dry_run" | "write") => {
    setMessage("");
    if (mode === "write" && run?.writeAuthorizationExpiresAt && Date.parse(run.writeAuthorizationExpiresAt) <= Date.now()) {
      setRun({ ...run, writeAuthorizationToken: null, writeAuthorizationExpiresAt: null });
      setMessage("미리보기 승인이 만료되었습니다. 백필 미리보기를 다시 실행해주세요.");
      return;
    }
    const filters=createPreferencesRepository(window.localStorage).load().value.filters;
    const currentExclusion = source === "albamon" ? exclusion : normalizeCollectionExclusionConfig({keywords:filters.exclusionKeywords,fields:filters.exclusionFields});
    const canonicalize = source === "albamon" ? canonicalizeImportedExclusionConfig : canonicalizeExclusionConfig;
    if (source === "albamon" && !serverProfileVerified) { setMessage("서버에서 검증된 알바몬 개인 검색 프로필을 먼저 저장해주세요."); return; }
    if (mode === "write" && run && canonicalize(currentExclusion) !== canonicalize(run.exclusion)) {
      setExclusion(currentExclusion);
      setRun(null);
      setMessage("제외 키워드 설정이 변경되었습니다. 새 설정으로 백필 미리보기를 다시 실행해주세요.");
      return;
    }
    setExclusion(currentExclusion);
    const body: Record<string, unknown> = {
      source,
      maxPages,
      mode,
      ...(source === "jobkorea" ? { exclusion: currentExclusion } : {}),
      ...(source === "jobkorea" ? range === "custom" ? { since } : { days: Number(range) } : {}),
    };
    if (mode === "write") {
      if (!run?.writeAuthorizationToken) {
        setMessage("먼저 같은 조건으로 백필 미리보기를 완료해주세요.");
        return;
      }
      body.writeAuthorizationToken = run.writeAuthorizationToken;
      body.confirmationPhrase = `BACKFILL ${source} ${run.scope === "albamon_personal_all" ? "ALL" : run.cutoffDate}`;
    }
    const response = await fetch("/api/backfill-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (response.ok) setRun(payload.run);
    else setMessage(payload.error?.message ?? "백필을 시작하지 못했습니다.");
  };

  const cancel = async () => {
    if (!run) return;
    const response = await fetch(`/api/backfill-runs/${run.id}/cancel`, { method: "POST" });
    if (response.ok) setRun((await response.json()).run);
  };

  const previewProfileImport = () => {
    setMessage("");
    try {
      const preview = parseAlbamonProfileUrl(profileUrl);
      if (!preview.roundTripMatch) throw new Error("제외 키워드 왕복 검증에 실패했습니다.");
      setImportPreview(preview);
    } catch (error) {
      setImportPreview(null);
      setMessage(error instanceof Error ? error.message : "알바몬 검색 URL을 확인하지 못했습니다.");
    }
  };

  const saveProfileImport = async () => {
    if (!importPreview?.roundTripMatch) return;
    const response = await fetch("/api/personal-albamon-profile", { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ areas: importPreview.areas, searchPeriodType: importPreview.searchPeriodType,
        sortType: importPreview.sortType, excludeBar: importPreview.excludeBar, exclusions: importPreview.keywords }) });
    const body = await response.json() as { configured?: boolean; profile?: PersonalAlbamonProfileFile | null; profileHash?: string | null; error?: { message?: string } };
    const readBack = body.profile?.albamon.exclusions ?? [];
    const matches = response.ok && body.configured && typeof body.profileHash === "string" && readBack.length === importPreview.keywords.length
      && readBack.every((item, index) => item === importPreview.keywords[index]);
    if (!matches) { setServerProfileVerified(false); setMessage(body.error?.message ?? "서버 개인 검색 프로필을 저장하고 다시 확인하지 못했습니다."); return; }
    const repository = createPreferencesRepository(window.localStorage); const current = repository.load().value;
    const fields = current.filters.exclusionFields.length ? current.filters.exclusionFields : DEFAULT_EXCLUSION_FIELDS;
    const nextExclusion = normalizeImportedCollectionExclusionConfig({ keywords: readBack, fields });
    repository.save({ ...current, filters: { ...current.filters, exclusionKeywords: nextExclusion.keywords, exclusionFields: nextExclusion.fields } });
    setExclusion(nextExclusion); setServerProfileHash(body.profileHash!); setServerProfileVerified(true); setRun(null);
    setMessage(`서버에서 제외 키워드 ${nextExclusion.keywords.length}개를 저장하고 확인했습니다.`);
  };

  if (!enabled) {
    return (
      <section className="collection-panel manual-backfill-panel">
        <h2>과거 공고 백필</h2>
        <p>
          수집 관리 기능이 비활성화되어 있습니다. 로컬 환경에서 <code>NEARBY_JOBS_ENABLE_COLLECTION_UI=1</code>로
          시작해야 백필할 수 있습니다.
        </p>
      </section>
    );
  }

  const active = Boolean(run && ["preparing", "running"].includes(run.status));
  return (
    <section className="collection-panel manual-backfill-panel" aria-labelledby="manual-backfill-title">
      <div className="section-heading">
        <div>
          <h2 id="manual-backfill-title">{source === "albamon" ? "내 검색조건 전체 백필" : "과거 공고 백필"}</h2>
          <p>{source === "albamon" ? "서울·경기 전체기간 공고를 현재 제외 키워드로 수집합니다. 급여와 거리는 저장 후 공고 목록에서 필터링합니다."
            : "등록일 최신순으로 요청한 기준일까지 자동 탐색합니다."}</p>
        </div>
      </div>
      <div className="backfill-controls">
        <label>
          소스
          <select value={source} disabled={active} onChange={(event) => { const next=event.target.value as typeof source;setSource(next);setMaxPages(next==="albamon"?ALBAMON_PERSONAL_BACKFILL_DEFAULT_MAX_PAGES:MANUAL_BACKFILL_DEFAULT_MAX_PAGES);setRun(null); }}>
            <option value="albamon">알바몬</option>
            <option value="jobkorea">잡코리아</option>
          </select>
        </label>
        {source === "jobkorea" && <label>
          기간
          <select value={range} disabled={active} onChange={(event) => { setRange(event.target.value); setRun(null); }}>
            <option value="3">최근 3일</option>
            <option value="7">최근 7일</option>
            <option value="14">최근 14일</option>
            <option value="30">최근 30일</option>
            <option value="custom">직접 날짜 선택</option>
          </select>
        </label>}
        {source === "jobkorea" && range === "custom" && (
          <label>
            기준 날짜
            <input type="date" value={since} onChange={(event) => { setSince(event.target.value); setRun(null); }} />
          </label>
        )}
        <label>
          최대 페이지
          <select value={maxPages} disabled={active} onChange={(event) => { setMaxPages(Number(event.target.value)); setRun(null); }}>
            {MANUAL_BACKFILL_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}페이지</option>)}
          </select>
        </label>
      </div>
      {source === "albamon" && <>
        <div className="backfill-status personal-profile-summary"><strong>해결된 검색조건</strong><dl><div><dt>지역</dt><dd>서울 · 경기</dd></div><div><dt>기간</dt><dd>전체</dd></div><div><dt>제외 키워드</dt><dd>{serverProfileVerified ? `서버 검증 ${exclusion.keywords.length}개` : "서버 프로필 미설정"}</dd></div><div><dt>정렬</dt><dd>월급순</dd></div></dl><p>{serverProfileVerified ? `제외 키워드 ${exclusion.keywords.length}개 적용` : "서버 개인 검색 프로필을 가져와 저장해주세요."} · 검색 결과가 끝나면 페이지 한도 전에 자동 종료됩니다.</p>{serverProfileHash && <small>프로필 {serverProfileHash.slice(0, 12)}…</small>}</div>
        <div className="profile-url-import">
          <h3>알바몬 검색 URL에서 제외어 가져오기</h3>
          <p>URL은 브라우저에서만 해석하며 원격 페이지를 열거나 저장하지 않습니다.</p>
          <label>알바몬 검색 URL<textarea value={profileUrl} onChange={(event) => { setProfileUrl(event.target.value); setImportPreview(null); }} rows={3} /></label>
          <button className="button soft" type="button" disabled={!profileUrl.trim()} onClick={previewProfileImport}>가져오기 미리보기</button>
          {importPreview && <div className="profile-import-preview" aria-live="polite">
            <strong>제외 키워드 {importPreview.keywords.length}개</strong>
            <p>전체기간 · 서울·경기 · 제외 업종 적용 · 월급순 · page 값은 가져오지 않음</p>
            <details><summary>제외어 전체 보기</summary><ol>{importPreview.keywords.map((keyword, index) => <li key={`${index}:${keyword}`}>{keyword}</li>)}</ol></details>
            <button className="button primary" type="button" onClick={() => void saveProfileImport()}>제외어 저장</button>
          </div>}
        </div>
      </>}
      <div className="backfill-actions">
        <button className="button soft" type="button" disabled={active || (source === "jobkorea" && range === "custom" && !since)} onClick={() => void start("dry_run")}>백필 미리보기</button>
        <button className="button primary" type="button" disabled={active || !run?.writeAuthorizationToken} onClick={() => void start("write")}>백필 실행</button>
        {active && <button className="button soft" type="button" onClick={() => void cancel()}>백필 중지</button>}
      </div>
      {message && <p className="collection-error" role="alert">{message}</p>}
      {run && (
        <div className="backfill-status" aria-live="polite">
          <strong>{active ? "백필 진행 중" : run.status === "completed" ? "백필 완료" : run.status === "cancelled" ? "백필 중지됨" : "백필 실패"}</strong>
          <dl>
            <div><dt>소스</dt><dd>{run.source === "albamon" ? "알바몬" : "잡코리아"}</dd></div>
            <div><dt>기간</dt><dd>{run.scope === "albamon_personal_all" ? "전체" : run.cutoffDate}</dd></div>
            <div><dt>현재 페이지</dt><dd>{run.currentPage}</dd></div>
            <div><dt>확인 공고</dt><dd>{run.recordsSeen}</dd></div>
            <div><dt>고유 공고</dt><dd>{run.uniqueRecords}</dd></div>
            <div><dt>가장 오래된 등록일</dt><dd>{run.oldestPostingDate ?? "확인 중"}</dd></div>
            <div><dt>소요</dt><dd>{(run.elapsedMs / 1000).toFixed(1)}초</dd></div>
          </dl>
          {run.result && <><p>소스 전체 {run.result.sourceTotal ?? "정보 없음"} · 원본 카드 {run.result.records} · 고유 공고 {run.uniqueRecords} · 중복 노출 {run.result.duplicates}</p><p>신규 {run.result.inserted} · 갱신 {run.result.updated} · 동일 {run.result.unchanged} · 제외 {run.result.candidatesExcluded} · {stopReasonLabel(run.result.stopReason)}</p><p>월급 {run.result.monthlyRecords} · 시급 {run.result.hourlyRecords} · 일급 {run.result.dailyRecords} · 급여 표시 {run.result.salaryRecords} · 좌표 {run.result.coordinateRecords}</p></>}
          {run.error && <p className="collection-error">{run.error.message}</p>}
        </div>
      )}
      <h3>최근 백필 기록</h3>
      {recent.length ? (
        <div className="backfill-history">
          {recent.map((item) => (
            <article key={item.id}>
              <strong>{item.source === "albamon" ? "알바몬" : "잡코리아"} · {item.cutoffDate ?? "전체"}</strong>
              <span>{item.pages}페이지 · 신규 {item.inserted} · 갱신 {item.updated} · 동일 {item.unchanged}</span>
              <small>{new Date(item.startedAt).toLocaleString("ko-KR")} · {item.stopReason ? stopReasonLabel(item.stopReason) : item.status}</small>
            </article>
          ))}
        </div>
      ) : <p>저장된 백필 실행 기록이 없습니다.</p>}
    </section>
  );
}
