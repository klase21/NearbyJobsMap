interface DatabaseSetupStateProps {
  kind: "not_ready" | "unavailable" | "corrupt";
}

const MESSAGES = {
  not_ready: "로컬 데이터베이스가 준비되지 않았습니다.",
  unavailable: "로컬 데이터베이스를 열 수 없습니다.",
  corrupt: "로컬 데이터베이스를 읽을 수 없습니다. 파일 손상 여부를 확인해 주세요.",
} as const;

export function DatabaseSetupState({ kind }: DatabaseSetupStateProps) {
  return (
    <main className="app-shell database-setup-shell">
      <section className="database-setup-panel" aria-labelledby="database-setup-title">
        <p className="database-setup-kicker">내 주변 일자리 지도 · 로컬 데이터</p>
        <h1 id="database-setup-title">{MESSAGES[kind]}</h1>
        <p>sanitized fixture와 기능 검증용 가상 공고를 준비하려면 프로젝트 폴더에서 다음 명령을 실행하세요.</p>
        <pre><code>npm.cmd run setup:local</code></pre>
        <p className="database-setup-note">설정이 끝난 뒤 이 화면을 다시 확인하세요. 데이터베이스는 앱을 열거나 production build를 실행하는 것만으로 생성되지 않습니다.</p>
        <a className="button primary database-retry" href="/">다시 확인</a>
      </section>
    </main>
  );
}
