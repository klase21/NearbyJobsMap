import type { LocalReadiness } from "../../services/local-readiness";

const ROOT = "https://github.com/klase21/NearbyJobsMap";
const DOCS = [["README", ROOT], ["Windows 설치 안내", `${ROOT}/blob/main/docs/WINDOWS_INSTALL.md`], ["문제 해결", `${ROOT}/blob/main/docs/TROUBLESHOOTING.md`], ["아키텍처", `${ROOT}/blob/main/docs/ARCHITECTURE.md`], ["릴리스", `${ROOT}/releases`]] as const;
function State({ ok, yes, no }: { ok: boolean; yes: string; no: string }) { return <li><strong>{ok ? "PASS" : "확인 필요"}</strong><span>{ok ? yes : no}</span></li>; }

export function LocalHelpPanel({ readiness, compact = false }: { readiness: LocalReadiness; compact?: boolean }) {
  return <aside className={`local-help-panel${compact ? " compact" : ""}`} aria-labelledby="local-help-title">
    <div><p className="eyebrow">NearbyJobsMap {readiness.version}</p><h2 id="local-help-title">도움말과 설치 상태</h2>
      <ul className="readiness-grid" aria-label="로컬 설치 준비 상태">
        <State ok={readiness.databaseReady} yes="데이터베이스 준비 완료" no="데이터베이스 설치 필요" />
        <State ok={readiness.migrationsReady} yes="마이그레이션 준비 완료" no="마이그레이션 확인 필요" />
        <State ok={readiness.chromiumReady} yes="브라우저 수집 기능 준비 완료" no="브라우저 수집 기능 설치 필요" />
        <State ok={!readiness.collectionUiEnabled} yes="수집 관리 비활성화" no="수집 관리 활성화" />
        <State ok={readiness.localhostSafe} yes="로컬 전용 실행" no="비로컬 주소 — 수집 실행 불가" />
        <State ok={readiness.latestBackupAvailable} yes="로컬 백업 있음" no="아직 로컬 백업 없음" />
      </ul></div>
    <div className="help-links"><h3>도움말</h3><nav aria-label="프로젝트 도움말">{DOCS.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}</nav>
      <h3>문제 신고</h3><p><code>.\scripts\doctor.ps1</code>을 실행하고, 필요하면 <code>.\scripts\support-bundle.ps1</code>로 ZIP을 만든 뒤 직접 검토하세요.</p>
      <p className="support-warning">런타임 DB, .env, 쿠키·자격 증명, 원본 HTML, 개인 정보가 든 화면은 공유하지 마세요.</p>
      <div className="help-actions"><a className="button soft" href={`${ROOT}/blob/main/docs/WINDOWS_INSTALL.md#playwright-chromium`} target="_blank" rel="noopener noreferrer">브라우저 설치 방법 보기</a><a className="button" href={`${ROOT}/issues/new/choose`} target="_blank" rel="noopener noreferrer">GitHub에서 문제 신고</a></div>
    </div>
  </aside>;
}
