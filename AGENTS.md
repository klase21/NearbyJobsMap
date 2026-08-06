# Project Identity

## Local Collection Control Protection

- 수집 관리 화면과 실행 API는 로컬 전용이며 `NEARBY_JOBS_ENABLE_COLLECTION_UI=1`이 없으면 실행을 허용하지 않는다.
- 공개·비로컬 호스트에서는 수집 실행을 거부하고 인증 시스템으로 이를 우회하지 않는다.
- 화면은 내장 preset만 받고 arbitrary URL, keyword, shell command, SQL, 환경 변수를 실행 입력으로 받지 않는다.
- 동시에 활성화된 수집 run은 최대 1개이며 수동 시작만 허용한다. scheduler, cron, recurring worker, remote queue를 추가하지 않는다.
- UI와 CLI는 동일한 JobKorea collection service를 사용하며 route handler에 crawler logic을 복제하거나 CLI를 shell-out하지 않는다.
- write는 동일 preset/pages/max-details 설정으로 30분 이내 성공한 dry-run, 서버 발급 opaque token, 정확한 `WRITE <preset-id>` 문구를 모두 요구한다.
- preset 및 global pages/details 한도를 서버와 클라이언트 양쪽에서 검증한다. 동시성 2와 retry 0을 UI에서 변경하지 않는다.
- dry-run progress와 승인은 메모리에만 유지하며 SQLite에 run, item, job, provenance를 쓰지 않는다.
- JobKorea login·verification을 우회하지 않고 기존 listing-only 표기를 유지하며 detail-complete 데이터를 downgrade하지 않는다.
- progress와 오류 응답에는 raw HTML, 본문, header, cookie, description, stack trace를 포함하지 않는다.

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
- 제품을 막는 구체적 결함 없이 JobKorea DOM 검증 framework를 더 확장하지 않는다.
- 알려진 검색 result root 안의 정규화 가능한 숫자 posting ID는 listing classification과 무관하게 상세 검증 후보가 될 수 있다.
- listing classification은 provenance metadata이며 상세 방문의 필수 gate가 아니다.
- JobKorea 상세 페이지의 ID·parser·normalizer·canonical 검증이 수동 수집의 최종 저장 경계다.
- JobKorea 수동 preset 수집은 목록 5페이지·상세 50건·상세 동시성 2를 넘지 않는다.
- JobKorea 수동 수집은 retry를 수행하지 않으며 실패 후보를 다른 후보로 대체하지 않는다.
- JobKorea collection은 수동 명령으로만 실행하며 scheduler나 background worker에 연결하지 않는다.
- 인증, 쿠키·프로필 재사용 또는 접근 제어 우회를 수집 경계에 추가하지 않는다.
- dry-run은 SQLite에 어떤 run, item, provenance, job도 쓰지 않는다.
- write 수집은 `--write`와 `--confirm`을 모두 요구한다.
- fixture, fictional demo, bounded manual collection provenance를 UI와 저장소에서 구분한다.
- JobKorea bounded manual collection의 상세는 cookie·authorization·referer 없이 안정적인 browser-like 식별자와 공개 페이지용 `Accept`·`Accept-Language`·`Cache-Control`만 사용하는 plain HTTP를 우선한다.
- 상세 redirect는 HTTPS allowlist와 동일 numeric posting ID를 유지해야 하며 login·root·cross-host·ID 변경을 구분한다. 진단에는 query를 제거한 host/path, status, hop 수만 남긴다.
- 수동 상세 요청 예산은 후보 수와 redirect hop을 각각 제한한다. redirect는 retry가 아니며 후보 하나당 최대 3 hop, 전체 후보는 계속 최대 30개다.
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

- Playwright `page.evaluate` 결과는 명시적인 JSON-safe plain object만 허용한다. DOM node, browser-native object, raw `Error`, `URL`, `Map`, `Set`, `BigInt`, handle을 경계 밖으로 반환하지 않는다.
- JobKorea page snapshot은 schema version과 256 KiB 직렬화 상한을 유지하며 raw HTML이나 전체 본문을 포함하지 않는다.
- snapshot이 완성되지 않은 후보 수는 `0`으로 바꾸지 않고 `null`/unknown으로 유지한다.
- 추천 영역만의 링크나 전역 numeric detail-link 존재만으로 ordinary search result를 판정하지 않는다.
- 거절된 numeric detail-link에는 정확히 하나의 기계 판독 가능한 primary reason을 부여하고, sample이 잘려도 사유별 aggregate 합계는 완전하게 유지한다.
- container·ancestor signature는 JSON-safe 최소 필드만 보존하고 ancestor `textContent`, raw HTML, style, DOM 객체를 포함하지 않는다.
- synthetic card·list·div 구조는 source 증거가 아니다. production ordinary selector는 실제 관찰 또는 기존 기록 근거 없이 추가하지 않는다.
- diagnostic sample, ancestor depth, container summary, data-attribute allowlist와 snapshot byte cap을 임의로 확대하지 않는다.
- JobKorea synthetic browser 테스트는 외부 네트워크 없이 실행한다.
- 실제 source 검증은 별도 승인된 bounded run 한 번으로 제한하며 자동 재시도하지 않는다.
- listing snapshot 추출이 실제로 검증되기 전에는 detail navigation을 추가하지 않는다.
- transport dry-run은 SQLite jobs, ingestion runs, provenance를 쓰지 않는다.

## Product and UX Guidance

### Bounded JobKorea collection

- 제품 진행을 막는 구체적 결함이 없는 한 DOM 검증 전용 framework나 snapshot schema를 계속 확장하지 않는다.
- 알려진 search result root 안의 numeric posting ID는 listing 분류와 무관하게 상세 검증 후보가 될 수 있고 identity는 numeric posting ID를 기준으로 한다.
- 상세 transport 실패 시 명시적으로 검증된 listing card fallback을 사용할 수 있지만 제목과 회사명이 모두 있어야 한다.
- listing fallback은 raw HTML, 카드 전체 text 또는 상세 설명을 저장하지 않고 `bounded_listing_collection` provenance와 `목록 정보` 표시를 유지한다.
- `bounded_manual_collection` 상세 확인 데이터는 이후 `bounded_listing_collection` 데이터로 downgrade하거나 덮어쓰지 않는다.
- JobKorea 수집은 수동 실행만 허용하며 상세 동시성은 최대 2, retry는 0이다.
- dry-run은 SQLite에 쓰지 않고 write mode는 `--write`와 `--confirm`을 모두 요구한다.
- 인증, cookie/session/profile 재사용, stealth 또는 접근 제어 우회는 금지한다.
- fixture, fictional demo, 상세 확인 수집, 목록 정보 수집 provenance와 UI 표시는 서로 구분한다.
- JobKorea preset은 수동 명령으로만 실행하며 source의 undocumented region parameter를 사용하지 않는다.
- preset 지역 판정은 listing card 추출 뒤, `maxDetails` 후보 선택 전에 로컬에서 수행한다.
- 원본 location 문자열을 보존하고 서울·경기 normalization은 파생 metadata로만 기록한다.
- 누락되거나 모호한 location은 `unknown`으로 유지하며 서울·경기로 추측하지 않는다.
- preset hard cap은 listing 5페이지, detail 50건이고 explicit override는 preset 한도를 줄일 수만 있다.
- UI source·provenance·completeness·region·status·map filter는 SQLite 데이터를 변경하지 않으며 versioned localStorage preference만 사용한다.

### Bounded Albamon listing collection

- Albamon 첫 live 경계는 공개 browser-rendered `/jobs/total` 목록만 사용하며 undocumented BFF나 상세 페이지를 호출하지 않는다.
- 페이지는 명시적으로 요청된 1~5페이지만 각각의 `page` query로 방문한다. `addedCount === 0`이나 `uniqueNewPostingIdCount === 0`을 empty 또는 조기 종료 근거로 사용하지 않는다.
- duplicate-only page는 정상 파싱 페이지이며 blocked, parser failure, unexpected page도 empty로 바꾸지 않는다.
- 한 listing record는 하나의 bounded single-posting card에서만 추출하고 numeric `/jobs/detail/{id}`를 identity로 사용한다. page-level ancestor나 복수 posting ID card는 거부한다.
- title과 company가 모두 있어야 listing-only CanonicalJob을 만들 수 있고 raw HTML, 전체 card text, description, 개인 연락처를 보존하지 않는다.
- 서울·경기 판정은 원본 location을 보존한 채 card 추출 후 candidate cap 전에 로컬로 수행하며 누락·모호한 위치는 추측하지 않는다.
- Albamon 목록 레코드는 `bounded_listing_collection`, `listing_only`, `not_attempted`, permission `unverified`로 표시하며 future detail-complete 데이터를 downgrade하지 않는다.
- CLI와 로컬 collection UI는 같은 Albamon collection service를 사용한다. UI는 내장 preset만 받고 한 active run, 30분 dry-run binding, typed write confirmation을 그대로 적용한다.
- Albamon 수집도 수동 실행만 허용하고 retry 0, 페이지 최대 5, 후보 최대 50을 유지하며 scheduler, recurring worker, 로그인·접근제어 우회를 추가하지 않는다.

- 광고 판정에 `[class*="ad"]`, `className.includes("ad")`, `/ad/`처럼 짧은 부분 문자열을 사용하지 않는다.
- 광고 class는 완전한 token 또는 근거가 있는 제한적 prefix pattern으로만 판정하며 `shadow`, `badge`, `header`, `gradient` 같은 utility token은 광고 근거가 아니다.
- 광고 판정은 후보 anchor에서 최대 6단계의 가까운 ancestor로 제한하고 `BODY`·`MAIN`의 페이지 수준 라벨을 하위 후보에 전파하지 않는다.
- generic utility container는 ordinary 또는 promoted 근거가 아니며 synthetic 구조를 실제 source selector 근거로 사용하지 않는다.
- production ordinary selector는 실제 관찰 또는 기존 기록 근거 없이 넓히지 않는다.
- JobKorea evaluator의 synthetic 88/28/60 acceptance 계약과 외부-network 차단을 유지한다.
- 실제 JobKorea transport run은 매번 별도 명시 승인을 받아야 한다.
- JobKorea structural grouping은 shadow diagnostic 전용이며 provisional group을 production ordinary candidate나 `CanonicalJob`으로 승격하지 않는다.
- provisional group identity는 visible text나 utility class가 아니라 numeric posting ID를 사용한다.
- group ancestor는 한 posting ID만 포함해야 하며 `HTML`·`BODY`·`MAIN`·전체 result root 같은 page-level element일 수 없다.
- 검증되지 않은 구조의 provisional eligibility에는 같은 parent 아래 최소 3개의 반복 single-posting sibling이 필요하다.
- explicit promoted·recommendation·recent-view region은 provisional ordinary eligibility에서 제외한다.
- generic class는 구조 반복을 비교하는 diagnostic shape에만 사용할 수 있고 production ordinary selector 근거가 아니다.
- synthetic structural DOM은 real-source evidence가 아니며 실제 transport는 별도 명시 승인이 있어야 한다.
- shadow aggregate는 sample truncation과 무관하게 완전해야 하고 snapshot은 JSON-safe 256 KiB 상한을 유지한다.
- descendant 한도 초과가 multi-ID 또는 split/duplicate group 진단을 가리면 안 되며, 동시에 참인 structural rejection reason은 함께 집계한다.
- diagnostic CLI는 provisional unique-ID 수, truncation 상태, 반복 parent summary와 bounded group sample을 보존한다.

- 목록이 주 인터페이스이고 지도는 보조다.
- 급여와 위치는 빠르게 비교할 수 있어야 한다.
- 소스와 위치 정확도·환산 신뢰도를 숨기지 않는다.
- 장식적이거나 판단에 도움이 되지 않는 UI를 피한다.

## Exclusion Keyword Protection

- 잡코리아와 알바몬 수집 및 jobs 화면은 하나의 source-neutral 제외 matcher와 정규화 규칙을 공유한다.
- 제외 입력은 literal substring만 허용하며 regex, wildcard, JavaScript, shell, SQL 또는 arbitrary property path로 해석하지 않는다.
- 수집 제외는 posting ID 중복 제거와 지역 필터 뒤, candidate cap 전에 적용한다. 제외 후보는 상세 시도·후보 slot·ingestion item·job provenance를 소비하지 않는다.
- 정규화된 keyword 순서, 선택 field, source, preset, pages, max-details를 dry-run/write authorization에 묶고 어느 하나가 바뀌면 write를 거부한다.
- keyword는 최대 30개, 2~50자이고 지원 field allowlist를 client와 server 양쪽에서 검증한다.
- CLI, collection UI, 두 source adapter는 같은 matcher를 사용하고 raw HTML, description, 연락처, hidden state를 비교 대상으로 추가하지 않는다.
- jobs 화면의 display exclusion은 SQLite를 변경하지 않으며 기존 filter preference의 versioned localStorage 경계와 reset 동작을 유지한다.
- 이 기능 작업에서는 실제 알바몬 요청을 실행하지 않는다. 수집은 계속 수동 실행, 동시성 최대 2, retry 0이며 scheduler나 접근 제어 우회를 추가하지 않는다.

## Collection Dashboard Protection

- `/collection` 개요와 dashboard read API는 SQLite만 읽고 JobKorea·Albamon transport, parser collection 또는 write ingestion을 시작하지 않는다.
- 현재 inventory는 `jobs` identity를 한 번씩 집계하며 여러 provenance observation이나 ingestion item을 공고 수로 중복 계산하지 않는다.
- dry-run은 메모리의 임시 실행이며 persisted write-run history에 포함하거나 SQLite run으로 만들어서는 안 된다.
- legacy run에 저장되지 않은 preset, exclusion, completeness, timing 또는 분모는 `null`/`정보 없음`으로 유지하고 기본값 `0`을 측정값처럼 표시하지 않는다.
- 기간·source·status analytics filter는 run history에만 적용한다. 전체 inventory를 필터링할 때는 화면에 그 의미를 명확히 표시해야 한다.
- dashboard SQL은 server-only repository에서 parameterized query로 실행하고 client 입력으로 SQL sort, column, expression을 조립하지 않는다.
- dashboard 응답과 run detail에는 raw source payload, HTML, description, cookie, request header, response body 또는 stack trace를 포함하지 않는다.
- collection 실행 controls와 mutation API의 localhost·feature flag·one-active-run·dry-run binding 보호를 유지한다.
- dashboard 검증을 위해 live source collection이나 추가 transport run을 실행하지 않는다.

### Saved collection profiles

- 저장 프로필은 기존 승인된 JobKorea·Albamon source adapter와 불변 built-in preset만 참조하며 arbitrary URL, host, command, SQL, JavaScript, regex, cookie, credential 또는 환경 변수를 저장하지 않는다.
- built-in preset은 immutable template이고 saved profile만 편집·복제·삭제·즐겨찾기할 수 있다.
- profile 구성 update는 expected revision을 요구하고 active run은 시작 시 profile ID·name·revision·configuration hash의 immutable snapshot을 사용한다.
- profile 구성 편집은 기존 dry-run write authorization을 무효화한다. favorite는 presentation metadata로 configuration hash와 revision을 바꾸지 않는다.
- profile 삭제는 과거 ingestion run, ingestion item, job 또는 provenance를 삭제하지 않으며 write run의 profile snapshot은 profile 삭제 뒤에도 남는다.
- profile CRUD와 조회 API는 localhost 및 `NEARBY_JOBS_ENABLE_COLLECTION_UI=1` 경계를 유지하고 parameterized SQLite query만 사용한다.
- profile 검증·CRUD·dashboard 조회는 source transport를 실행하지 않는다. profile 구현 검증 중 live JobKorea·Albamon run을 만들지 않는다.
- dry-run의 collection-data 무변경 의미를 유지하기 위해 profile `lastUsedAt`은 saved-profile write run 시작 때만 갱신한다.

### Saved profile comparison

- 저장 프로필 비교는 읽기 전용이며 collection run을 시작·중지·변경하거나 jobs, ingestion runs/items, provenance를 쓰지 않는다.
- profile ID가 과거 실행 연결의 권위 있는 identity다. profile 이름으로 legacy run이나 삭제된 profile history를 현재 profile에 연결하지 않는다.
- current-revision 비교는 saved profile ID, revision, configuration hash가 현재 profile evidence와 모두 일치하는 persisted write run만 포함한다. 누락된 historical evidence는 `null`/`정보 없음`으로 유지한다.
- 비교에는 persisted write run만 포함하고 dry-run과 in-memory active progress를 historical totals에 섞지 않는다.
- 정확한 overlap은 성공한 ingestion item의 `(source, sourcePostingId)`만 사용한다. failed item과 candidate cap 전에 제외된 공고는 observed identity로 세지 않는다.
- cross-source title·company fuzzy matching이나 semantic entity resolution을 추가하지 않는다. source가 다른 pair의 exact overlap은 `해당 없음`으로 표시한다.
- 비교 요청은 현재 저장 profile 2~4개로 제한하고 local-only feature flag·origin 보호와 strict typed body 검증을 유지한다.
- comparison repository SQL은 parameterized server-only read이며 arbitrary sort, field, SQL expression을 client 입력으로 받지 않는다.
- temporary comparison 검증을 위해 real database에 synthetic ingestion run을 만들거나 live JobKorea·Albamon source 요청을 수행하지 않는다.
- primary navigation label은 flex alignment와 controlled line-height로 수직 중앙을 유지한다. 음수 margin, `top` pixel offset 또는 `translateY` hack으로 맞추지 않는다.

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
