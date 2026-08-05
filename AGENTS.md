# Project Identity

이 프로젝트는 로컬 우선 통합 채용 목록과 보조적 근무지 지도를 위한 fixture 기반 UI MVP다. 현재 활성 소스는 잡코리아·알바몬이며, 작은 sanitized fixture와 명시적인 가상 공고만 화면에 제공한다.

## Project Direction

- 통합 목록을 먼저 만든다.
- 지도는 필터 결과를 탐색하는 보조 수단이다.
- 소스 원문을 손실 없이 보존한다.
- 소스 adapter를 서로 격리한다.
- parser는 sanitized fixture 계약으로 검증한다.
- 급여와 위치를 신뢰도와 함께 비교 가능하게 만든다.

## Protected Architecture

명시적 요청 없이 다음을 바꾸지 않는다.

- `CanonicalJob` 공통 모델
- 급여·주소·근무일 등 원문 보존 필드
- 네트워크와 분리된 소스 adapter 경계
- fixture 최소화·비식별화 규칙
- 정확 좌표와 추정 위치를 구분하는 `LocationAccuracy`
- exact duplicate와 probable duplicate의 구분
- UI가 직접 소비하는 `CanonicalJob` 단일 공고 계약
- 목록 우선·지도 보조의 제품 위계
- 버전이 있는 브라우저 저장소 경계

## Non-Negotiable Rules

- 명시적 승인 없이 새 소스를 추가하지 않는다.
- 승인 전에는 고용24를 연동하지 않는다.
- 원본 급여·주소 텍스트를 제거하거나 덮어쓰지 않는다.
- 추정 위치를 정확 위치로 표현하지 않는다.
- probable duplicate를 자동 병합하지 않는다.
- parser 함수에 네트워크 fetch를 넣지 않는다.
- 소스 보호 장치를 우회하지 않는다.
- 쿠키, 세션, 토큰, 개인 연락처, 실제 대량 데이터를 커밋하지 않는다.
- 불필요한 Markdown 파일을 만들지 않는다.
- 관련 없는 정상 동작을 수정하지 않는다.
- 두 번째 비호환 UI 전용 공고 모델을 만들지 않는다.
- parser·급여 파싱·위치 분류 로직을 React component에 넣지 않는다.
- 가상 공고를 실제 활성 공고처럼 표현하거나 가짜 원문 링크를 만들지 않는다.
- 소스 공고 생명주기와 사용자 지원 상태를 같은 필드로 합치지 않는다.
- 지도용 추정 좌표를 정확 좌표로 표현하지 않는다.
- 명시적 승인 없이 live network collection을 추가하지 않는다.
- 목록 우선 동작과 지도 보조 동작을 뒤바꾸지 않는다.
- 복수 근무지는 `workplaces[]` 구조를 유지하고 쉼표 문자열 하나로 축소하지 않는다.
- 근무지 미정은 지오코딩하거나 본사 주소로 대체하지 않는다.
- 본사 주소를 실제 근무지로 취급하지 않는다.
- 연봉 원문과 인센티브·협의 문구를 손실 없이 보존한다.
- 근거 없이 좌표 하나를 복수 근무지 전체를 대표하는 값으로 사용하지 않는다.
- 지도 marker는 소스에서 관찰됐거나 명시적인 가상 데이터 좌표에만 만든다.
- SQLite driver와 repository는 server-only이며 client component에서 import하지 않는다.
- 커밋된 SQL migration은 append-only다. 이미 배포·적용된 migration 파일을 다시 쓰지 않는다.
- DB 테스트는 고유한 임시 SQLite 파일만 사용하고 `data/nearby-jobs.sqlite`를 열거나 reset하지 않는다.
- `(source, sourcePostingId)` exact identity 고유성을 유지하며 probable duplicate를 DB identity로 병합하지 않는다.
- 카테고리·고용형태·`workplaces[]`를 쉼표 문자열이나 JSON 한 필드로 평탄화하지 않는다.
- fixture-derived와 fictional provenance 및 evidence 구분을 DB와 UI에서 유지한다.
- 사용자 지원 상태는 localStorage에 남기고 source lifecycle을 저장하는 SQLite jobs table에 합치지 않는다.
- production build 중 migration, fixture import, demo seed 등 DB write를 실행하지 않는다.
- SQLite·WAL·SHM·임시 테스트 DB 파일을 커밋하지 않는다.
- DB reset은 확인 플래그와 안전한 대상 경로 검증 없이 실행하지 않는다.
- 잡코리아 live transport는 `transport:jobkorea:once` 수동 명령으로만 실행하며 앱·build·migration·seed·test에서 자동 실행하지 않는다.
- 잡코리아 원샷은 목록 1회, 상세 최대 3회, redirect hop을 포함한 콘텐츠 HTTP 최대 4회와 robots 사전확인 최대 1회를 넘기지 않는다.
- 원샷 request cap을 명시적 승인 없이 완화하지 않으며 retry loop, pagination, scheduler, polling, background worker를 추가하지 않는다.
- transport는 cookie·session·browser profile·authorization을 사용하거나 보존하지 않고 CAPTCHA·WAF·로그인·검증 절차를 우회하지 않는다.
- 접근 제한 우회를 위한 browser automation을 추가하지 않는다.
- one-shot provenance·권한 미확인 경고·관찰 시각을 DB와 UI에서 유지하고 기존 fixture provenance history를 지우지 않는다.
- transport 테스트는 주입된 mock HTTP만 사용하며 자동화된 테스트에서 live source 요청을 만들지 않는다.
- `--dry-run`은 jobs, child collection, provenance, ingestion run을 포함한 모든 DB write를 금지한다.
- 알바몬 live transport와 production crawler는 각각 별도의 명시적 승인이 필요하다.
- Playwright는 정상 공개 페이지 렌더링에만 사용하며 stealth plugin, webdriver 속성 위장, CAPTCHA·검증·access-control 우회에 사용하지 않는다.
- Playwright run마다 새 격리 context를 사용하고 cookie, storage state, 저장 browser profile을 import·export·재사용하지 않는다.
- 잡코리아 검색 page의 empty 판정에 `addedCount === 0` 또는 `uniqueNewCount === 0`을 사용하지 않는다. duplicate-only page, blocked page, login page, timeout, parser failure는 empty가 아니다.
- `_GI_List`는 관찰된 internal/public-page 계약일 뿐 공식 API가 아니다. cookie, session, authorization, token, signed value가 필요하면 direct transport를 실행하지 않는다.
- 잡코리아 bounded browser 검증은 수동 `--confirm` 명령만 허용하며 검색 최대 2페이지, 상세 최대 3건, direct 최대 1회, robots 최대 1회를 넘기지 않는다.
- 과거 AI 검색 607페이지 crawl을 자동으로 재실행하지 않는다. full pagination과 request cap 확대는 별도 명시적 승인이 필요하다.
- browser/direct transport 자동 테스트는 mock 또는 synthetic sanitized contract만 사용하고 live source를 호출하지 않는다.
- page-1/max-details-0 Playwright 진단 명령의 40초 내부 예산과 단계별 timeout을 약화하지 않는다. page·browser cleanup은 상한을 가져야 하며 정상 close가 멈추면 해당 임시 BrowserServer만 종료한다.
- lifecycle timeout도 구조화된 page result와 단계 진단을 반환해야 하며 raw stack trace나 무기한 pending command로 끝내지 않는다.

## Product and UX Guidance

- 목록이 주 인터페이스이고 지도는 보조다.
- 급여와 위치는 빠르게 비교할 수 있어야 한다.
- 소스와 위치 정확도·환산 신뢰도를 숨기지 않는다.
- 장식적이거나 판단에 도움이 되지 않는 UI를 피한다.

## Validation Policy

모든 변경은 다음 명령을 통과해야 한다.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

fixture 변경은 명시 필드 assertion과 민감정보 검사도 통과해야 한다. 실패를 광범위한 lint 비활성화나 타입 회피로 숨기지 않는다.

## Documentation Rule

허용되는 Markdown 파일은 다음뿐이다.

- `README.md`
- `AGENTS.md`
- `RESEARCH.md`
- `reports/FIXTURE_VALIDATION.md`
- 추후 명시적으로 요청된 필수 GitHub template

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
