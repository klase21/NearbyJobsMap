# 내 주변 일자리 지도

잡코리아와 알바몬 공고를 하나의 목록에서 급여·근무조건·위치 정확도와 함께 비교하는 로컬 우선 UI MVP다. 소규모 sanitized fixture를 기존 parser로 정규화한 데이터와 명확히 표시된 기능 검증용 가상 공고만 로컬 SQLite에 저장한다. 목록이 주 인터페이스이며 지도는 현재 필터 결과의 공간적 분포를 확인하는 보조 기능이다.

> 이 프로젝트는 잡코리아·알바몬의 공식 파트너 연동이 아니다. production crawler와 실시간 수집 기능은 포함하지 않는다. 공개 페이지의 기술적 접근 가능성은 수집·재사용 허가를 뜻하지 않으므로 실제 연동 전 각 소스의 약관과 권한을 별도로 확인해야 한다. 원본 소스 페이지가 항상 권위 있는 기준이다.

잡코리아에는 별도 승인된 수동 명령으로만 실행되는 **bounded 공개 검색 전송 prototype**이 있다. 공개 검색은 격리된 Playwright Chromium으로 렌더링하고, 상세 최대 3건만 기존 parser와 SQLite ingestion에 연결한다. 이는 공식 제휴나 지속적인 실시간 연동이 아니다. 알바몬은 계속 fixture-only다.

## 현재 지원 범위

- 활성 소스: 잡코리아, 알바몬
- 통합 공고 목록, 키워드·소스·지역·직종·고용형태·조건·급여·상태·위치 정확도 필터
- 최신·마감·거리·급여 단위·월 환산 추정·회사명 정렬
- OpenStreetMap/Leaflet 기반 보조 지도와 목록·마커 선택 동기화
- GPS 권한 없는 예시 출발지, 수동 좌표 입력, 직선거리 계산
- 로컬 필터·정렬·출발지·지도 표시·사용자 공고 상태 저장
- 반응형 데스크톱/모바일 화면과 키보드·스크린리더 기본 접근성
- 900px 이하에서는 목록을 기본으로 한 단일 패널 전환을 사용하며, 숨긴 지도 인스턴스는 유지하지 않는다.
- 기존 소스별 fixture parser, 손실 없는 `CanonicalJob`, 급여·위치·중복 판별 서비스
- 버전형 SQLite migration, exact source identity, 콘텐츠 해시와 ingestion run 추적
- sanitized fixture 6건과 명시적 가상 공고 10건의 멱등 local ingestion
- 수동 `--confirm` 전용 잡코리아 bounded 검색: 검색 최대 2페이지, 상세 최대 3건, direct 검증 최대 1회
- 관찰된 잡코리아 연봉 범위와 알바몬 연봉·별도 인센티브 fixture 계약
- 후방 호환 `workplaces[]` 구조와 근무지 미정·본사 주소 분리 규칙
- 고용24: 공식 API 검토 후 별도 승인이 필요한 roadmap 소스이며 현재 adapter·fixture·UI 선택 항목이 없다.

포함하지 않는 범위는 지속적 실시간 수집, production crawler, pagination, retry loop, scheduler, background worker, 알바몬 live transport, 원격·클라우드 데이터베이스, 인증, 계정, 클라우드 저장, geocoding·교통 API, GPS, 분석·광고·배포다.

## 실행

Node.js와 npm이 설치된 환경에서 다음 순서로 처음 실행한다.

```powershell
Set-Location C:\NearbyJobsMap
npm.cmd install
npm.cmd run setup:local
npm.cmd run dev
```

브라우저에서 `http://localhost:3000`을 연다. `setup:local`은 migration 적용, sanitized fixture import, fictional demo seed, 상태 출력을 순서대로 실행하며 반복 실행해도 중복을 만들지 않는다.

로컬 production 실행은 다음과 같다.

```powershell
Set-Location C:\NearbyJobsMap
npm.cmd run setup:local
npm.cmd run build
npm.cmd run start
```

`npm run build`는 데이터베이스를 만들거나 수정하지 않는다. `/`는 Node.js request 시점에 SQLite를 읽는 동적 server route다.

## 로컬 SQLite

기본 데이터베이스는 `./data/nearby-jobs.sqlite`다. 다른 로컬 파일을 사용하려면 서버와 DB 명령에 `NEARBY_JOBS_DB_PATH` 환경 변수를 지정한다. 이 값은 비밀정보가 아니며 `.env.example`은 필요하지 않다. 생성된 `.sqlite`, `.db`, WAL, SHM 파일과 `data/private`, `data/live`는 Git에서 제외된다.

```powershell
npm.cmd run db:migrate
npm.cmd run db:import:fixtures
npm.cmd run db:seed:demo
npm.cmd run db:status
npm.cmd run db:reset -- --confirm
npm.cmd run setup:local
```

- `db:migrate`: pending SQL migration만 transaction으로 적용한다.
- `db:import:fixtures`: 기존 source adapter가 만든 fixture-derived `CanonicalJob` 6건을 멱등 수집한다.
- `db:seed:demo`: 기존 가상 공고 10건을 멱등 수집한다.
- `db:status`: 경로, migration, 출처·record 종류·좌표 유무 집계와 최근 ingestion run을 출력한다.
- `db:reset`: `--confirm`이 있어야 기본 `data` 디렉터리 안의 설정된 DB와 해당 WAL/SHM만 제거한다. migration까지 다시 만들려면 `--migrate`도 명시한다.
- `setup:local`: 위 준비 작업과 상태 확인을 한 번에 수행한다.

DB가 없거나 migration이 빠졌으면 UI는 raw SQLite 오류 대신 `로컬 데이터베이스가 준비되지 않았습니다`와 `npm.cmd run setup:local` 안내를 표시한다. 앱을 열거나 build하는 것만으로 DB를 seed하지 않는다.

SQLite 파일은 자동 백업되지 않는다. 로컬 데이터를 보존해야 한다면 서버를 중지한 상태에서 DB 파일을 별도로 복사한다. 현재 데이터는 모두 재생성 가능한 fixture/demo이지만 향후 로컬 메타데이터가 늘어나면 명시적인 백업·복원 정책이 필요하다.

## 잡코리아 bounded 검색 transport

과거 사용자가 만든 Playwright crawler는 `https://www.jobkorea.co.kr/Search?stext=AI&tabType=recruit&Page_No={PAGE_NUMBER}` 공개 검색을 Chromium으로 렌더링하고 `a[href*="/Recruit/GI_Read"]`를 관찰했다. 당시 AI 검색은 607페이지, 추출 링크 9,665개, canonical URL dedup 후 9,575개였으며 `지금 주목할 만한 공고`와 `AD`를 일반 결과에서 제외했다. 이 수치는 과거 관찰값이며 현재 페이지 수·결과 수·구조를 보장하지 않는다.

이후 plain server-side HTTP GET으로 같은 계열 listing을 확인한 1회 실험은 로그인 페이지를 받았다. 이는 **그 fetch-only 요청의 결과**이지, 정상 브라우저로 렌더링한 공개 검색 전체가 로그인 필수라는 증거가 아니다. 기존 `transport:jobkorea:once`는 이 진단을 재현하는 legacy fetch-only prototype으로 남기며 새 listing 경로의 기본값으로 사용하지 않는다. URL·redirect·sanitizer·detail parser·ingestion 유틸리티는 계속 재사용한다.

새 명령은 `/Search` 공개 URL만 받고 `tabType=recruit`, `Page_No=1`이 빠졌으면 안전한 기본값으로 명시한다. Windows npm이 URL의 `&`를 shell 구분자로 재해석할 수 있어 아래처럼 단일 query 인자 URL을 권장한다. 실행에는 `--confirm`이 필수다. `--pages`는 1·2, `--max-details`는 0·1·2·3만 허용하며 0은 링크 계약만 검증한다.

```powershell
Set-Location C:\NearbyJobsMap

npm.cmd run transport:jobkorea:search:once -- `
  --search-url "https://www.jobkorea.co.kr/Search?stext=AI" `
  --pages 1 `
  --transport playwright `
  --max-details 0 `
  --dry-run `
  --confirm
```

쓰기 실행:

```powershell
npm.cmd run transport:jobkorea:search:once -- `
  --search-url "https://www.jobkorea.co.kr/Search?stext=AI" `
  --pages 1 `
  --transport playwright `
  --max-details 1 `
  --confirm
```

- `--transport playwright`는 run마다 새 headless Chromium과 격리 context를 만들고 종료한다. 저장 profile, storage state, imported cookie, login, stealth plugin, webdriver 위장, retry는 사용하지 않는다. JavaScript는 공개 검색 UI 렌더링에만 사용한다.
- 검색 navigation은 최대 2페이지이고 `Page_No=1,2`만 명시적으로 만든다. 다음 버튼 자동 추적, 종료 페이지 탐색, 607페이지 재실행은 없다. 상세 navigation은 최대 3회이며 실패한 상세를 다음 후보로 대체하지 않는다.
- `--transport auto`는 현재 검증 상태에서 Playwright를 명시적으로 선택한다. access block 뒤 direct로 몰래 전환하지 않는다.
- `--transport direct`는 공개 페이지에서 현재 `POST /Recruit/Home/_GI_List/` 요청이 관찰되고 cookie·authorization·token이 없을 때만 최대 1회 익명 POST를 허용한다. `page`, `condition[local]`, `order`, `pagesize`, `tabindex`는 관찰된 internal/public-page form 계약이지 공식 API가 아니다. session 또는 token 신호가 있거나 현재 계약이 관찰되지 않으면 `direct_endpoint_session_required` 또는 `direct_endpoint_unavailable`로 끝난다.
- 매 명령은 robots.txt를 최대 1회 별도 확인한다. robots 허용은 법적 허가를 의미하지 않는다.
- Playwright page timeout은 15초이고 readiness는 ordinary 상세 링크, 명시적 no-result, login/verification/block 신호 중 하나를 기다린 뒤 짧은 안정화 지연을 사용한다. 무기한 sleep은 없다.
- 일반 공고는 `tr.devloopArea[data-gno]` 또는 검색 결과 문맥 안의 `/Recruit/GI_Read/{숫자 ID}` 링크만 후보로 삼는다. `AD`, sponsored, 추천·최근·주목 영역은 별도 집계하고 제외한다.
- 페이지의 `validEmptyPage`는 source가 명시적으로 no-result를 표시할 때만 true다. `uniqueNewCount=0`, duplicate-only, login, block, timeout, parser failure는 empty가 아니다.
- raw HTML은 메모리에서만 읽고 저장하지 않는다. sanitizer는 최소 JobPosting·목록 anchor만 남기며 설명 본문·연락처·지원자·script·분석/광고 필드를 제외한다.
- dry-run은 jobs, child collection, provenance, ingestion run을 포함해 DB에 아무것도 쓰지 않고 예상 inserted/updated/unchanged/rejected만 출력한다.
- 쓰기 실행은 exact source identity와 content hash를 재사용하며 `bounded_public_browser_observation`, 선택 transport, page 번호, listing 위치를 provenance history에 기록한다.
- 현재 이용·재가공 권한은 `unverified`다. 결과는 `원샷 전송 검증 데이터`와 관찰 시각으로 표시하며 원문 페이지를 최종 기준으로 확인해야 한다.

2026-08-05 bounded 실제 재검증에서는 명령 전달 오류 3회가 confirmation 단계에서 네트워크 전에 차단됐다. 이후 올바르게 시작된 Playwright Step 1은 외부 60초 실행 한도까지 구조화 결과를 반환하지 못해 강제 종료됐고, source 결과·후보 수·direct contract를 확정하지 못했다. 남은 프로세스와 임시 profile은 확인 후 제거했고 SQLite hash는 동일했다. 따라서 과거 Playwright 성공 이력은 유효한 반증이지만, **현재 Playwright 흐름은 이번 실행에서 성공 또는 접근 차단 어느 쪽으로도 재확인되지 않았다.** `_GI_List`도 현재 익명 요청으로 재검증되지 않아 runtime `auto`는 Playwright를 유지한다.

원샷 관찰 데이터를 로컬에서 모두 제거하려면 서버를 중지하고 전체 로컬 DB reset 후 fixture/demo를 다시 준비한다. 이 작업은 사용자 상태 localStorage를 지우지 않는다.

```powershell
npm.cmd run db:reset -- --confirm
npm.cmd run setup:local
```

원샷만 선택 삭제하는 관리 UI나 명령은 아직 없다. `db:status`는 현재 one-shot 관찰 공고 수와 최근 one-shot run 상태를 표시한다.

## UI와 데이터 구조

`src/app`은 Next.js App Router 진입점, `src/components`는 표현 계층이다. `src/db`는 server-only SQLite 연결·migration·repository·ingestion 경계이며, `src/data/sqlite-job-provider.ts`만 request-time DB 결과를 compact `UiJobRecord` DTO로 바꿔 client dashboard에 전달한다. UI는 별도 공고 모델을 만들지 않고 `CanonicalJob`을 감싼 최소 파생 타입만 사용한다. 기존 `src/sources` parser는 네트워크와 분리되어 있고 fixture import 때만 실행되며 UI 렌더 중 재실행하지 않는다.

기존 fixture에서 만들기 어려운 급여·지역·상태 조합은 `src/data/demo-jobs.ts`의 가상 공고로 보완한다. fixture-derived, fictional, one-shot observation provenance와 reference, evidence 유형, content hash, ingestion item 결과를 SQLite에 별도로 보존한다. `job_provenance_history`는 exact identity가 겹쳐도 기존 fixture 증거를 지우지 않는다. 가상 공고는 화면에서 `기능 검증용 가상 공고`로 표시되고 가짜 원문 링크를 제공하지 않는다. 원본 fixture나 transport HTML은 DB나 client bundle에 저장하지 않으며 `dangerouslySetInnerHTML`도 사용하지 않는다.

`jobs`의 `(source, source_posting_id)`가 exact identity다. ID가 없는 미래 입력은 같은 source의 canonical HTTPS URL만 fallback으로 쓸 수 있다. probable duplicate와 교차 source 유사 공고는 고유성 제약이나 자동 병합에 사용하지 않는다. 카테고리, 고용형태, `workplaces[]`는 순서가 있는 자식 테이블로 저장하며 한 좌표를 복수 근무지 전체에 복제하지 않는다.

지도는 좌표가 있는 현재 필터 결과만 표시한다. 가상 좌표는 지도 동작 검증용임을 데이터 출처와 함께 유지하며, 관찰되지 않은 구·동 텍스트를 좌표로 변환하지 않는다. `exact_coordinate`·`exact_address`와 추정 위치 표시는 시각적으로 구분된다.

단일 위치 필드는 기존 소비자 호환용 기본 보기이며 `workplaces[]`가 구조화 근거다. 복수 근무지는 신뢰할 수 있는 개수와 개별 위치를 따로 보존하고, 분리된 좌표가 없으면 지도에서 제외한다. `location_undecided`는 원문을 남기되 주소·행정구역·좌표를 채우지 않으며 목록에는 `근무지 미정`, 지도 동작에는 `지도 표시 불가`로 나타난다. 기업정보의 본사 주소는 실제 근무지를 대체하지 않는다.

## 필터와 로컬 저장

원 급여 단위별 최솟값은 서로 다른 단위를 동일 값처럼 비교하지 않는다. 월 환산 금액은 설정된 근무시간·근무일·연간 개월 수에 따른 비교용 추정치이며 원 급여 표현을 대체하지 않는다.

공유 가능한 source 공고 lifecycle과 provenance는 SQLite에 저장한다. 출발지, 필터, 정렬, 지도 표시 여부와 `검토 중`·`관심`·`지원 예정`·`지원 완료`·`제외` 사용자 상태는 계속 버전형 localStorage repository를 통해 이 브라우저에만 저장된다. 손상된 JSON은 안전한 기본값으로 복구한다. 입력한 출발지와 화면 설정은 기본적으로 이 브라우저에만 저장되며, 브라우저 저장 공간을 지우면 삭제될 수 있다. 쿠키·세션·비밀번호·API 키·실제 대량 공고·위치 이력은 저장하지 않는다.

## Fixture와 개인정보 정책

sanitized fixture는 공개 페이지에서 관찰한 계약의 작은 축약본이다. 전체 설명, 연락처, 담당자, 이메일, 쿠키, 세션, 토큰, 광고·분석 식별자를 포함하지 않는다. fixture를 추가할 때도 최소 요청 원칙과 `FixtureMetadata`를 유지하고, 실제 대량 데이터나 비공개 응답을 커밋하지 않는다. 소스 구조는 예고 없이 변할 수 있다.

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run setup:local
npm run db:status
```

## 디자인 기준

화면 구조와 시각 위계는 [Nearby Jobs Map MVP Figma](https://www.figma.com/design/JzTHb8n3QCt0uh6HABXgKi/Nearby-Jobs-Map-MVP?node-id=0-1&p=f&t=OtJEJeyhakylAKK3-0)를 기준으로 브라우저 반응성과 접근성에 맞게 조정했다. 현재 허용 소스 정책에 맞춰 고용24 활성 탭과 CSV 내보내기는 구현하지 않았다.

## 현재 한계

- 데이터 계약은 8개 sanitized fixture와 제한된 가상 공고에 기반하며 현재 실공고 전체를 나타내지 않는다. 화면의 16개 공고 구성은 그대로다.
- SQLite는 단일 로컬 파일이며 동시 다중 writer, 자동 백업, 복원 UI, server-side pagination은 아직 제공하지 않는다.
- production build는 DB를 포함하지 않으므로 실행 환경마다 `setup:local` 또는 별도 승인된 ingestion을 먼저 수행해야 한다.
- 지도 타일은 OpenStreetMap 네트워크 가용성에 의존하지만 공고 목록은 타일 실패와 무관하게 작동한다.
- 거리는 직선거리이며 실제 이동시간이나 경로가 아니다.
- 좌표가 없는 실제 fixture에는 지도를 위해 좌표를 만들지 않아 지도에서 제외된다.
- 연봉 단일값·범위·인센티브 표시는 source fixture로 확인했지만, 복수 근무지와 근무지 미정의 실제 상세 구조는 이번 소스별 3건 제한에서 찾지 못해 여전히 미검증이다.
- 알바몬의 관찰된 내부 BFF는 공식 API가 아니며 live 코드가 호출하거나 의존하지 않는다.
- 잡코리아 browser transport의 기술적 접근 가능성·robots 결과는 이용허가가 아니다. 현행 계약·저작권·재가공·보관 범위는 미확인이다.
- bounded search는 최대 2페이지만 검증하며 전체 pagination, 최신성 보장, 삭제 동기화, 자동 refresh가 없다. 현재 실제 Playwright 재검증은 runner timeout으로 미확정이고 direct `_GI_List` 익명 계약도 미확정이다.

## 다음 개발 단계

다음 정확한 작업은 **사용자가 이번 runner-timeout 결과와 종료 보강을 검토한 뒤, 별도 승인된 단 한 번의 Playwright page-1/max-details-0 재검증을 실행해 current DOM 후보 수와 `_GI_List` 관찰 여부만 확정하는 것**이다. 성공 전에는 page 2나 상세을 열지 않고, 성공하더라도 full pagination은 별도 승인 전 시작하지 않는다.
