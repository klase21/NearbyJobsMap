# 잡코리아·알바몬 Fixture 계약 검증

## 1. Executive Summary

2026-08-05 기준 공개 페이지의 최소 표본으로 시작한 fixture 5개에 이번 계약 검증용 상세 fixture 3개를 추가했다. 최종 구성은 잡코리아 5개(목록 1, 상세 4), 알바몬 3개(목록 1, 상세 2), 총 8개다. 각 목록 fixture는 각각 잡코리아 3개 항목, 알바몬 2개 항목의 필요한 표시 필드만 포함한다. 모든 fixture는 연락처·담당자·이메일·쿠키·세션·토큰·본문을 제거한 수동 축약본이며 공개 저장소 포함 안전성을 자동 검사한다.

공통 모델은 원본 급여·주소·근무일을 유지하고, 관찰값과 추론·환산값을 분리한다. 잡코리아와 알바몬 parser는 네트워크가 없는 별도 adapter이며 한 소스의 실패가 다른 소스에 전파되지 않는다. 알바몬의 문서화되지 않은 내부 BFF는 production 의존성에서 제외했다.

## 2. 조사 및 검증 범위

- 잡코리아: 공개 서울 키워드 목록 1페이지, 공개 상세 1건을 현재 DOM으로 재확인했다. RESEARCH.md에서 이미 관찰한 공개 마감 상세 1건은 최소 축약 fixture로 사용했다.
- 알바몬: 공개 지역별 목록 1페이지, 공개 상세 1건을 현재 DOM으로 재확인했다.
- 요청 수를 늘려 누락 사례를 찾지 않았다. 로그인, CAPTCHA, WAF 우회, pagination loop, BFF 호출, geocoding은 하지 않았다.
- RESEARCH.md가 구조 판단의 기준이다. 새 관찰과 충돌한 항목은 아래에 명시했다.

증거 표기는 `Observed`, `Officially documented`, `Inferred`, `Unknown`을 사용한다. 이번 구현에서 소스별 계약은 모두 공개 페이지 `Observed` 또는 미확인 `Unknown`이며, 문서화되지 않은 endpoint를 공식 API로 취급하지 않는다.

## 3. 잡코리아 Fixture

### 목록 계약

목록 fixture 파일은 1개이며 항목 3개다. `sourcePostingId`, 정규화 전 source URL, 제목, 회사, 표시 지역, 가능한 경우 급여·경력·학력·고용형태를 보존한다. 일반 서울 검색의 현재 DOM에서 공고 링크와 ID·제목·회사명은 `Observed`다. 목록 급여는 안정적으로 노출되지 않은 항목을 `null`로 두었다.

### 상세 계약

상세 fixture는 4개다. 기존 49715720·48997208에 연봉 범위 49090158과 근무지/본사 주소가 다른 연봉 범위 49493208을 추가했다. 새 두 사례의 Schema.org `JobPosting`에서 `baseSalary.value.unitText=YEAR`, 최소·최대, 실제 `jobLocation`을 관찰했다(`Observed`, 높음). 49493208의 기업정보 위치는 근무지가 아니므로 별도 fixture 표시 필드에만 남기고 canonical workplace에 넣지 않았다.

### 급여 필드

- `월급 220~450만원 (면접 후 결정)`: 원문, 월급 유형, 최소 2,200,000원, 최대 4,500,000원, 협의 가능을 검증했다.
- `회사 내규에 따름 (면접 후 결정)`: `company_policy`, 숫자 `null`, 협의 가능을 검증했다.
- JSON-LD의 최대 4,510,000원과 표시 원문의 최대 450만원이 다르다. 손실 방지를 위해 사용자 표시와 canonical 급여는 표시 원문을 기준으로 하며 구조화 값은 source detail에 별도로 남긴다(`Observed`, 높음).
- `연봉 3,000~3,300만원 (면접 후 결정)`과 `연봉 3,800~4,000만원 (면접 후 결정)`을 추가했다. 표시 원문의 만원 범위는 각각 30,000,000~33,000,000원, 38,000,000~40,000,000원으로 보존·파싱한다. JSON-LD 상한은 각각 33,010,000원, 40,010,000원으로 표시 원문과 다르므로 source detail에만 남긴다(`Observed`, 높음).
- 시급·일급·주급·건별은 잡코리아 source fixture에서 아직 찾지 않았다(`Unknown`).

### 위치 필드

활성 상세는 전체 도로명 주소와 청량리역 표시를 포함한다(`Observed`, 높음). 좌표는 이번 재검증에서 캡처하지 않아 `null`이며 `exact_address`로 분류한다. 마감 fixture는 서울 강남구까지만 있어 `district`다. 본사 주소를 근무지로 대체하지 않는다.

### 날짜 및 마감

활성 상세의 `datePosted`와 `validThrough`는 JSON-LD에서 읽는다. 명시적 마감 문구는 `closed`를 우선한다. 마감일만 지났으면 `expired`, 3일 이내면 `closing_soon`, 근거가 없으면 `unknown`이다. 시간 의존 함수에는 명시적 `now`가 필요하다.

### 누락 및 변동 위험

- `JOBKOREA_DETAIL_JSONLD_MISSING`, `JOBKOREA_SALARY_SHAPE_CHANGED`, `SOURCE_POSTING_ID_MISSING`, `JOBKOREA_LISTING_ITEMS_EMPTY` 진단을 제공한다.
- RESEARCH.md는 49715720 본문에서 청량리·남양주 두 장소를 언급했으나 현재 공개 DOM의 제한 확인에서는 `남양주`를 재확인하지 못했다. fixture는 현재 확인 가능한 주소 하나와 `workplaceCount=1`만 기록한다. 수정·개인화·표시 영역 변화 여부는 `Unknown`이다.
- JSON-LD가 모든 표시 필드를 포함한다고 가정하지 않는다.

### 테스트 결과

목록 로딩, 복수 JSON-LD 선택, 원문 급여·주소, 연봉 범위·월 환산, 본사/근무지 분리, 복수 위치 배열·진단, ID, 마감일, JSON-LD 누락 허용, fixture 안전성을 명시 assertion으로 검증한다.

## 4. 알바몬 Fixture

### 목록 계약

목록 fixture 파일은 1개이며 항목 2개다. 현재 공개 지역 목록의 상단 로고 영역에서 시급 14,400원과 월급 2,456,880원 사례를 축약했다(`Observed`, 높음). 추적 쿼리를 제거하고 `promoted=true`로 유기 목록과 구분했다.

### 상세 계약

상세 fixture는 2개다. 기존 118270285에 모바일 공개 상세 117771568의 연봉과 별도 인센티브 사례를 추가했다. 새 fixture는 Schema.org `JobPosting`의 `YEAR/30000000`과 표시 원문을 결합하며 문서화되지 않은 BFF에는 의존하지 않는다(`Observed`, 높음).

### 급여 필드

- 목록: `시급 14,400원`, `월급 2,456,880원`.
- 상세: `일급 110,000원`과 JSON-LD `DAY/110000`.
- `연봉 30,000,000원 회사 내규에 따름 (면접 후 경력 및 직전 연봉을 고려하여 협의) + 인센티브 별도 (매장/개인 타겟 성과에 따라 상이)`를 원문 그대로 보존한다. 구조화된 30,000,000원만 연봉 기준값이며 인센티브를 보장 급여에 합산하지 않고 월 환산 신뢰도를 `low`로 둔다(`Observed`, 높음).
- 주급·건별의 source fixture는 여전히 `Unknown`이다.

### 위치 필드

상세 표시 주소 `파주시 법원읍 술이홀로 956`, JSON-LD address, 공개 지도 링크 좌표 37.855262756347656 / 126.8779525756836을 보존한다(`Observed`, 높음). 좌표가 있으면 `exact_coordinate`, 좌표가 빠지면 도로명 주소 또는 지역 수준으로 낮춘다. 좌표를 추정하거나 geocoding하지 않는다.

### 날짜 및 마감

상세 `datePosted=2026-08-04`, `validThrough=2026-08-24`를 검증했다(`Observed`, 높음). 상시모집, 자동갱신, 폐쇄·삭제 URL 동작은 이번 fixture 범위에서 `Unknown`이다.

### 누락 및 변동 위험

- `ALBAMON_DETAIL_JSONLD_MISSING`, `ALBAMON_LOCATION_SHAPE_CHANGED`, `SOURCE_POSTING_ID_MISSING`, `ALBAMON_LISTING_ITEMS_EMPTY` 진단을 제공한다.
- 내부 BFF는 RESEARCH.md에서 `Observed internal endpoint`였지만 비공식·불안정 계약이다. 이번 구현에는 endpoint 문자열, 호출 코드, 응답 fixture가 없다.
- 지도 좌표가 실제 근무지인지 페이지의 주소 경고와 함께 확인해야 하며 회사 주소로 단정하지 않는다.

### 테스트 결과

목록 급여·프로모션, 상세 JSON-LD, 원문 근무조건, ID, 좌표 보존, 정확도, 좌표 누락 내성, 위치 형태 변경, fixture 안전성을 명시 assertion으로 검증한다.

## 5. 공통 CanonicalJob 결정사항

- `JobSource`는 roadmap 호환을 위해 `work24`를 예약하지만 활성 코드는 `jobkorea`와 `albamon`뿐이다.
- source posting ID는 제공값을 그대로 사용하고 내부 ID는 `source:id`로 조합한다.
- 급여, 주소, 근무일의 원문 필드를 필수적으로 보존한다.
- 누락은 `null` 또는 빈 배열이며 값을 만들어 넣지 않는다.
- `modifiedAt`, `remote`, `shiftType`, `parcelAddress`는 현재 증거가 부족해 `null`이다.
- `rawPayloadReference`는 작은 sanitized fixture 디렉터리만 가리키며 실제 대량 원문 저장소를 뜻하지 않는다.
- `CanonicalWorkplace[]`를 후방 호환 확장으로 추가했다. `workplaces[]`가 구조화 위치 근거이며 기존 단일 주소·행정구역·좌표 필드는 단일하고 명확한 근무지의 호환용 기본 보기다. 복수 근무지와 미정 상태에서는 단일 필드로 임의 축소하지 않는다.
- 빈 `workplaces[]`는 그 자체로 미정을 뜻하지 않는다. `location_undecided`는 관찰 문구나 명시 source flag가 있어야 한다. 본사 주소는 workplace 배열에 넣지 않는다.

## 6. 급여 파싱 및 정규화 결정사항

원문을 그대로 유지하면서 시급·일급·주급·월급·연봉·건별, 만원·원·쉼표·범위·회사 내규·면접 후 결정·기본급+인센티브를 보수적으로 파싱한다. 지원하지 않는 문구는 `unknown`과 `null`이다. 기본 월 환산 정책은 시급×209시간, 일급×22일, 월급 그대로, 연봉÷12다. 각각 신뢰도를 부여하며 mixed·company policy·negotiable·unknown은 환산하지 않는다. 환산은 세전 비교 추정치이고 실수령액이나 정확 급여가 아니다.

## 7. 위치 정확도 결정사항

우선순위는 다중 근무지, 미정, 본사만, 관찰 좌표, 정확 주소, 역세권, 동, 구, 시, 없음 순이다. 정확 주소가 없는 역 정보는 행정구역보다 `station_area`를 우선하지만 정확 주소를 덮지는 않는다. 다중 근무지는 단일 정확 marker로 축소하지 않는다. `exact_coordinate`만 정확 marker 후보이고 주소 기반 결과는 geocoding 이후에도 estimated 표시가 필요하다. `headquarters_only`, `location_undecided`, `unavailable`은 기본 지도에서 제외한다.

## 8. 중복 판별 결정사항

같은 소스와 posting ID를 exact identity로 사용하고, ID가 없을 때 같은 소스의 query/hash 제거 canonical URL을 fallback으로 쓴다. 교차 소스는 정규화 회사명·제목·도로명 주소·구/동·급여 범위·근무시간·고용형태의 사용 가능한 신호에 가중치를 적용한다. 결과는 `exact`, `probable`, `related`, `different`, `unknown`과 score/reasons이며 probable·related는 자동 병합하지 않는다.

## 9. 스키마 변경 감지 전략

parser는 전체 페이지 실패 대신 항목별 `ParseResult`를 반환한다. anchor ID, `JobPosting`, 목록 item 수, 급여 숫자 형태, 위치 주소/좌표 쌍의 변화를 코드화된 진단으로 노출한다. snapshot만 비교하지 않고 ID·원문·숫자·좌표·마감 같은 제품 핵심 필드를 직접 assertion한다. 한 소스 fixture와 테스트 디렉터리는 다른 소스와 분리돼 있다.

이번에 `JOBKOREA_ANNUAL_SALARY_SHAPE_CHANGED`, `ALBAMON_ANNUAL_SALARY_SHAPE_CHANGED`, `JOBKOREA_MULTIPLE_WORKPLACES_UNSUPPORTED`, `ALBAMON_MULTIPLE_WORKPLACES_UNSUPPORTED`, 소스별 `WORKPLACE_COUNT_AMBIGUOUS`, 소스별 `LOCATION_UNDECIDED_TEXT_DETECTED`, `JOBKOREA_MULTIPLE_LOCATION_COORDINATE_AMBIGUOUS`를 추가했다. optional 위치·급여가 깨져도 unrelated detail 값은 반환한다.

## 10. 이번 계약 강화 조사 결과

- 기준선: typecheck, lint, 12개 test file의 85개 test, production build 모두 변경 전에 통과했다.
- 공개 상세 확인: 잡코리아 3건(49090158, 기존 49715720 재확인, 49493208), 알바몬 3건(116721065, 117799712, 117771568). 소스별 상세 3건·총 6건 한도를 지켰고 추가 listing은 열지 않았다.
- 연봉: 잡코리아 범위 2건과 알바몬 단일값+회사내규/협의+별도 인센티브 1건을 찾았다(`Observed`). 새 source fixture는 잡코리아 2개, 알바몬 1개다.
- 복수 근무지: 검증 가능한 두 개 이상의 실제 근무지 상세 구조를 찾지 못했다(`Unknown`). 기존 49715720도 현재 DOM/JSON-LD에서는 한 장소만 재확인됐다. 합성 단위 테스트는 배열 보존·수 불일치·좌표 축소 금지 동작만 검증하며 source evidence로 계산하지 않는다.
- 근무지 미정: 검증 가능한 활성 소스 상세 문구를 찾지 못했다(`Unknown`). 합성 단위 테스트는 문구 감지·주소/좌표 null·UI 지도 제외 동작만 검증하며 source evidence로 계산하지 않는다.
- 알바몬 116721065는 루트로 이동했고 117799712는 유효한 상세 내용을 제공하지 않아 fixture로 만들지 않았다. 우회하지 않았다.
- 구조 차이: 잡코리아 연봉 범위의 표시 상한과 JSON-LD 상한이 각각 10,000원 달랐다. 표시 원문을 canonical 기준으로 유지하는 기존 원칙과 일치한다. 알바몬은 복합 표시 문구보다 JSON-LD가 고정 연봉만 구조화했다. 인센티브는 별도 비보장 요소로 남긴다.

## 11. 공개 저장소 포함 가능 항목

- 현재 8개 sanitized JSON fixture(이전 5개 + 신규 3개)
- 공통 도메인 타입과 순수 parser/normalizer
- fixture metadata와 증거·한계 설명
- 실제 연락처가 없는 소수의 공개 공고 ID, 제목, 회사명, 급여·주소 축약 필드

각 fixture는 `sanitized: true`이며 자동 민감정보 검사 결과가 없어야 커밋 가능하다.

## 12. 공개 저장소 제외 항목

전체 HTML·설명 본문, 전화번호, 이메일, 담당자명, 신청자 데이터, 쿠키, 세션, 인증 헤더, 토큰, 추적 ID, 광고 payload, 비공개 endpoint 파라미터, BFF 원본 전체 응답, 대량 공고, geocoding 결과, live/private/raw 데이터는 제외한다.

## 13. 차단 및 미검증 사항

- 일반 웹 열기 도구에서 두 상세 URL과 알바몬 목록을 직접 열지 못했으나 공개 브라우저 DOM에서는 로그인 없이 확인됐다. 차단 우회는 하지 않았다.
- 잡코리아 다중 근무지의 이전 연구 관찰과 현재 DOM이 일치하지 않는다.
- source fixture 기준 연봉은 검증됐다. 주급·건별, station-only, 다중 근무지, 위치 미정, 상시모집, 수정일, remote, parcel address는 미검증이다.
- 잡코리아·알바몬의 production 자동수집 및 재사용 허가는 확인되지 않았으며 별도 약관·법률 검토가 필요하다.
- 공식 파트너 API나 feed 계약은 이번 구현 범위가 아니다.

## 14. 다음 권장 기술 작업

정확한 다음 작업은 **각 소스 이용 허가 경계를 먼저 확인한 뒤, 별도 승인된 소규모 표본에서 `multiple_locations`와 `location_undecided` 실제 상세 구조만 재검증하는 것**이다. 두 source contract가 관찰되기 전 live fetcher, DB, 배포 작업을 시작하지 않는다.

## 15. Evidence Log

| 소스 | URL | 유형 | 확인일 | 관찰 | 분류 | 신뢰도 | 공식 문서 여부 |
|---|---|---|---|---|---|---|---|
| 잡코리아 | `https://www.jobkorea.co.kr/Search/?stext=서울` | 공개 목록 | 2026-08-05 | 검색 URL이 `tabType=recruit`를 유지하며 공고 링크에 posting ID, 제목, 회사가 표시됨 | Observed | 높음 | 아님 |
| 잡코리아 | `https://www.jobkorea.co.kr/Recruit/GI_Read/49715720` | 공개 상세 | 2026-08-05 | `JobPosting` JSON-LD, ID, 월급 범위, 날짜, 고용형태, 경력·학력, 도로명 주소와 표시 근무조건 | Observed | 높음 | Schema.org 사용은 관찰, 소스 API 문서 아님 |
| 잡코리아 | `https://www.jobkorea.co.kr/Recruit/GI_Read/48997208` | 공개 마감 상세 | 2026-08-05 | RESEARCH.md에서 마감 표시와 회사 내규 급여, URL 접근 유지 관찰 | Observed | 중간 | 아님 |
| 알바몬 | `https://www.albamon.com/jobs/area` | 공개 목록 | 2026-08-05 | 상세 ID 링크, 지역, 시급·월급 표시, 상단 로고 노출 구조 | Observed | 높음 | 아님 |
| 알바몬 | `https://www.albamon.com/jobs/detail/118270285` | 공개 상세 | 2026-08-05 | `JobPosting` JSON-LD, 일급, 날짜, 근무일·시간, 주소 및 공개 지도 링크 좌표 | Observed | 높음 | Schema.org 사용은 관찰, 소스 API 문서 아님 |
| 잡코리아 | `https://www.jobkorea.co.kr/Recruit/GI_Read/49090158` | 공개 상세 | 2026-08-05 | YEAR 연봉 범위, 표시 원문과 JSON-LD 상한 차이, 단일 근무지 | Observed | 높음 | 아님 |
| 잡코리아 | `https://www.jobkorea.co.kr/Recruit/GI_Read/49493208` | 공개 상세 | 2026-08-05 | YEAR 연봉 범위, 실제 근무지와 기업정보 위치 분리 | Observed | 높음 | 아님 |
| 알바몬 | `https://m.albamon.com/jobs/detail/117771568` | 공개 상세 | 2026-08-05 | YEAR 고정 연봉, 회사내규·협의·별도 인센티브 원문, 단일 근무지 | Observed | 높음 | 아님 |
| 알바몬 | `https://www.albamon.com/jobs/detail/116721065` | 공개 상세 시도 | 2026-08-05 | 루트로 이동해 현재 상세 계약을 확인하지 못함 | Unknown | 낮음 | 아님 |
| 알바몬 | `https://www.albamon.com/jobs/detail/117799712` | 공개 상세 시도 | 2026-08-05 | 상세 경로는 열렸으나 검증 가능한 본문/JSON-LD 없음 | Unknown | 낮음 | 아님 |
| 알바몬 | 문서화되지 않은 BFF 패턴 | 내부 응답 | 2026-08-05 | RESEARCH.md에서 내부 endpoint로 관찰되었으나 이번 코드·fixture에서 제외 | Observed | 중간 | 공식 문서 아님 |

Fixture 안전 판정은 공개 페이지의 법적 재사용 권한을 판정하지 않는다. 원본 페이지가 권위 있는 정보원이며 production 연동 전 이용약관과 허가를 다시 확인해야 한다.

최종 검증(2026-08-05): `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` 모두 통과했다. Vitest 결과는 12개 test file, 98개 test이며 기존 85개를 모두 보존하고 13개를 추가했다. fixture 8개에 대한 개인정보·인증정보 정규식 검사도 통과했다.
