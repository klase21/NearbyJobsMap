# 서울·경기 채용공고 통합 서비스 소스 조사

## 1. Executive Summary

조사일은 2026-08-05(KST)이다. 이 문서에서 **관찰됨(Observed)**은 공개 페이지·브라우저 DOM·공개 요청에서 직접 확인한 사실, **공식 문서(Officially documented)**는 운영사 또는 공공데이터 문서의 명시, **추론(Inferred)**은 관찰된 구조에서 도출한 설계 판단, **미확인(Unknown)**은 이번 최소 조사로 검증하지 못한 사항을 뜻한다.

- **첫 연동 권고: 고용24.** 공식 채용정보 Open API가 목록/상세, `startPage`, `display`, `total`, 구인인증번호, 급여 유형·원문·최소·최대, 도로명/기본/상세 주소, 등록일·마감일·최종수정일을 문서화한다. 다만 기업회원 가입, 심사·승인, 이용자격 확인이 선행되어야 한다. [공식 문서]
- **공식 API 사용 대상: 고용24를 반드시 공식 API로 연동.** 공개 HTML을 수집하는 대신 승인된 XML API를 사용해야 한다. 공공데이터포털의 해당 데이터는 무료·실시간이지만 제4유형(출처표시·비영리·변경금지) 및 제3자 권리를 표시하므로, 상업 서비스·정규화·재배포 가능 범위를 승인기관과 서면 확인해야 한다. [공식 문서]
- **기술적으로 가장 쉬운 소스: 승인 후의 고용24 API.** 화면만 놓고 보면 잡코리아 상세의 Schema.org `JobPosting`도 매우 쉽지만, 전체 검색·페이지네이션·권한까지 포함한 운영 연동은 고용24가 가장 명세가 분명하다. [관찰됨+추론]
- **기술적으로 가장 위험한 소스: 알바몬.** 목록은 클라이언트 중심이며 내부 BFF POST를 사용하고, 필터/페이지 상태가 URL과 클라이언트 상태 양쪽에 걸쳐 있다. 이 내부 엔드포인트는 공식 API가 아니며 구조 변경 위험이 높다. [관찰됨]
- **최고의 근무지 데이터:** 표본 상세 기준 알바몬과 잡코리아 모두 도로명 주소와 지도 좌표를 노출했다. 알바몬은 근무지 지도 링크 좌표와 “회사 소재지와 다를 수 있음” 경고가 명확했고, 잡코리아는 `JobPosting.jobLocation`과 지도 링크 좌표가 함께 있었다. 대규모·일관성 관점에서는 고용24 공식 API가 주소 필드를 문서화하지만 위·경도는 문서화하지 않았다. 지도 MVP에는 **고용24 정확 주소→허가된 지오코딩**이 가장 예측 가능하다. [관찰됨+공식 문서]
- **최고의 급여 구조:** 고용24 공식 API. `salTpNm`, `sal`, `minSal`, `maxSal`을 동시에 제공한다. 잡코리아·알바몬도 상세 JSON-LD에 통화·기간·최소/최대를 제공한 표본이 있으나 모든 공고에 대한 보장은 확인되지 않았다. [공식 문서+관찰됨]
- **가장 큰 미해결 질문:** (1) 고용24 API의 이 서비스 사업자 승인 가능 여부와 상업적/변형 이용 범위, (2) 잡코리아 공식 API의 현행 신청·계약·쿼터·재배포 조건, (3) 알바몬의 공식 채용 피드/API 존재 및 계약 조건, (4) 세 소스 모두 갱신 시 ID 유지 규칙, 삭제/404/리다이렉트 전이, (5) 전체 공고에서 좌표·정확주소 제공률이다. [미확인]
- **권장 다음 기술 작업:** 앱이나 크롤러가 아니라, 먼저 고용24에 API 이용자격·상업적 표시/변형·캐시/보관·원문 링크 의무를 질의하고 승인을 신청한다. 승인 후 **목록 2페이지×상세 10건 이하의 비식별 fixture 계약 검증**만 수행해 필드 충족률·주소 정확도·급여 손실 여부를 측정한다.

통합 원칙은 “목록 우선, 지도 보조”다. 주소가 `exact_coordinate` 또는 검증된 `exact_address`가 아닌 공고는 지도에서 추정 마커로 명확히 표시하거나 제외한다. 급여는 언제나 `originalText`를 원본으로 보존하고 정규화 값은 별도 파생치로만 제공한다.

## 2. 조사 범위와 방법

대상은 잡코리아, 알바몬, 고용24뿐이다. 서울·경기 전체, 전 직종을 향후 지원한다는 제품 가정을 두고 공개 검색 화면, 인접한 소수 페이지, 공개 상세 표본, robots.txt, 사이트맵 표기, 약관/저작권 문구, 제휴·공식 API 문서를 최소 요청으로 확인했다. 대량 다운로드, 자동 페이지 루프, 로그인 우회, CAPTCHA, 프록시, 보호 파라미터 분석, 연락처 수집은 하지 않았다.

공개 상세 표본은 급여 기간과 위치 형태가 다른 사례를 선택했다. 잡코리아 표본 `49715720`은 월급 범위·면접 후 결정·두 근무처 서술·정확 주소·역세권·지도 좌표를, 만료 표본 `48997208`은 회사 내규·면접 후 결정과 마감 후 상세 존속을 보여준다. 알바몬 표본 `118270285`은 일급·정확 주소·지도 좌표를 보여준다. 고용24 표본 `KEC0222607070001`은 월급 범위·정확 주소·역세권·향후 근무지 변경 서술을 보여준다. 담당자 연락처나 개인 식별 정보는 연구 자료로 보존하지 않았다.

한계가 있는 최소 표본 조사이므로 “일반적”이라는 표현은 다수 표본 통계가 아니라 현재 UI에서 반복적으로 보인 패턴을 뜻한다. 정확 제공률, 최대 페이지 크기, 장기 순서 안정성은 미확인이다.

## 3. 소스 비교표

| 항목 | 잡코리아 | 알바몬 | 고용24 |
|---|---|---|---|
| 공식 사이트 | `https://www.jobkorea.co.kr/` | `https://www.albamon.com/` | `https://www.work24.go.kr/` |
| 공개 검색 | `/Search/?stext=...`, `/recruit/joblist` | `/jobs/area` | `/wk/a/b/1200/retriveDtlEmpSrchList.do` |
| 비로그인 검색/상세 | 가능 [관찰됨] | 가능 [관찰됨] | 가능, 연락처 일부는 로그인 [관찰됨] |
| 서울+경기 동시 | 지역 UI에서 복수 선택 가능 [관찰됨] | 서울·경기 동시 선택 상태 확인 [관찰됨] | 다중 지역은 API에서 공식 지원; 웹 UI도 복수 지역 선택 구조 [공식+관찰] |
| 렌더링 | 공개 DOM+상세 JSON-LD; 검색의 SSR/CSR 비율 미확인 | 클라이언트 중심 하이브리드, 내부 BFF XHR | 의미 있는 HTML/폼 중심, 공식 XML API 별도 |
| 급여 | 목록 일부 원문; 상세 텍스트+JSON-LD 구조화 | 목록 유형+금액; 상세 텍스트+JSON-LD | API 원문+유형+min/max |
| 위치 | 상세 정확주소·역·지도 좌표 표본 | 상세 정확주소·지도 좌표 표본 | API 주소 필드; 좌표 없음 |
| 페이지네이션 | `Page_No`, 페이지 번호; 인접 페이지 중복 관찰 | 번호 버튼, `page`; 내부 상태 의존 | 웹 번호형으로 보임; API `startPage/display/total` |
| 공식 접근 | 채용정보 XML API 샘플 존재; 현행 계약 미확인 | 공개 API 미발견; 제휴 창구 존재 | 승인형 공식 XML API 명세 완비 |
| 권한 위험 | 상세에 무단전재·재배포·재가공 금지 | 약관 및 상세에 사전동의 없는 복제/영리 이용 제한 | API 승인+공공누리 제4유형·제3자 권리 |
| 권고 | API/제휴 조건 확인 후 2순위 | 계약형 피드 확인 후 3순위 | 공식 API 승인 후 1순위 |

## 4. 잡코리아

### 4.1 진입 경로

- 공식: `https://www.jobkorea.co.kr/`; 공개 통합검색: `https://www.jobkorea.co.kr/Search/?stext=서울`; 지역 채용: `https://www.jobkorea.co.kr/recruit/joblist?menucode=local&localorder=1`. [관찰됨]
- 검색 화면의 지역·직무 필터에서 서울과 경기 조건을 함께 선택할 수 있는 구조가 보였다. 이번에는 URL 코드 조합을 임의 추정하지 않았다. [관찰됨]
- 검색·상세는 로그인 없이 열리며 상세 `https://www.jobkorea.co.kr/Recruit/GI_Read/49715720`이 공개되었다. [관찰됨]
- 약관은 `www.jobkorea.co.kr`, `m.jobkorea.co.kr`을 별도 매체로 공식 열거한다. 이번 조사에서는 데스크톱 상세만 필드 단위로 검사했으므로 모바일의 카드 수·필드 축약·지도 동작 차이는 미확인이다. [공식 문서+미확인]
- 검색어와 페이지는 `stext`, `Page_No`로 URL에 보존된다. 상세 링크의 `Oem_Code`, `logpath`, `sc`, `listno`는 유입/광고 문맥으로 보이므로 canonical 식별에서 제거하고 `/Recruit/GI_Read/{id}`를 사용한다. [관찰됨+추론]

### 4.2 검색 결과 구조

브라우저 DOM에서 총건수, 결과 카드와 페이지 링크가 즉시 관찰되고 상세에는 JSON-LD가 있다. 검색 화면이 순수 SSR인지 하이브리드인지 초기 HTML 응답을 별도로 저장하지 않았으므로 **하이브리드 가능성은 있으나 미확인**이다.

GraphQL은 관찰되지 않았고, 공개/내부 JSON 검색 API도 확인하지 않았다. 이는 “없음”이 아니라 이번 최소 관찰에서 증거가 없다는 뜻이다. 상세의 지도·주소가 별도 요청으로 로드되는지 역시 미확인이다.

| 관찰 항목 | 결과 |
|---|---|
| 요청 | 공개 GET `/Search?stext={keyword}&Page_No={n}` [관찰됨] |
| 키워드 | `stext` [관찰됨] |
| 페이지 | `Page_No` [관찰됨] |
| 정렬 | UI `관련도순`; 정확 파라미터 미확인 |
| 지역/직무/급여/고용/등록일/마감 | UI 필터 존재; 이번 최소 조사에서 파라미터 미확인 |
| 총건수 | `총 52,738건` 같은 표시 [관찰됨, 시점 변동] |
| 내부 API | 검색용 공식/비공식 JSON 엔드포인트를 확인하지 않음 [미확인] |

### 4.3 페이지네이션

페이지 번호 1~10과 이전/다음 링크, `Page_No`가 관찰됐다. 한 페이지 DOM에서 고유 공고 ID 32개가 보였으나 광고/추천 영역이 섞일 수 있어 기본 유기 목록 크기로 단정하지 않는다. 1·2페이지 비교에서 5개 ID가 중복됐고 2페이지를 다시 불러오자 선두 순서가 달라졌다. `AD` 표시 공고도 있었다. [관찰됨]

따라서 수집기는 “첫 중복=종료”, “순서 고정”, “페이지가 비었으므로 끝”을 가정해서는 안 된다. 광고·프로모션과 유기 결과를 분리하고, 페이지별 ID 집합·총건수·연속 빈 페이지 임계치를 함께 사용해야 한다. 빈 페이지/최대 페이지 크기는 미확인이다.

### 4.4 목록 필드

목록에서 제목, 회사, `/GI_Read/{id}`, 서울/경기와 구·시 또는 `외 N`, 업종·직무, 일부 급여 원문, 지원 방식, 경력, 등록일, 마감/상시채용, 로고, `AD`가 직접 보였다. 학력·정확주소·근무일/시간·좌표·수정일은 상세가 필요하다. 원격근무와 다중 근무지는 제목/지역 `외 N`만으로는 모호하다.

### 4.5 상세 페이지

표본에는 Schema.org `JobPosting` JSON-LD가 있었고 `title`, `description`, `datePosted`, `validThrough`, `employmentType`, `experienceRequirements`, `educationRequirements`, `directApply`, `hiringOrganization`, `jobLocation.address.streetAddress`, `baseSalary`, `identifier`, `url`을 제공했다. 화면 본문에는 고용형태, 급여 원문, 근무일·시간, 정확주소, 역·거리, 경력·학력, 접수기간이 의미 있는 텍스트로 있었다. 상세 요강은 iframe이었다. [관찰됨]

지도 링크에는 `lat`, `lng`가 있었으나 이를 모든 공고의 공식 좌표 필드로 일반화할 수 없다. 표본 본문에는 두 지점이 서술됐지만 JSON-LD/요약은 첫 지점만 구조화했다. 다중 근무처는 상세 본문과 구조화 데이터의 불일치 검사가 필요하다.

### 4.6 급여 구조

관찰 형식: `월급 220~450만원 (면접 후 결정)`, `연봉 3,100만원~`, `연봉 ~3,100만원`, `연봉 4,500만원~`, `회사 내규에 따름 (면접 후 결정)`, `회사내규에 따름`, 상세 본문의 `기본급+인센티브`. 목록은 원문 텍스트, 표본 상세 JSON-LD는 `unitText: MONTH`, `minValue`, `maxValue`, `currency: KRW`였다. JSON-LD의 최대 4,510,000원과 표시 `450만원` 사이처럼 내부 상한/반올림 차이가 있을 수 있으므로 화면 원문을 우선 보존한다. [관찰됨]

### 4.7 위치 구조

표본은 도로명 주소·건물/층, 역·도보거리, 지도 좌표를 제공해 `exact_coordinate` 또는 `exact_address`로 신뢰 가능했다. 반면 목록의 `서울 외 14`, `경기 외 14`는 `multiple_locations`; `서울 외 1`은 상세 확인 전 모호하다. 회사 정보의 “위치”와 모집요강 “근무지주소”가 같아도 항상 같다고 가정하지 않는다. 다중 지점은 개별 `Workplace[]`가 필요하며 첫 주소 하나만 지도에 찍지 않는다.

### 4.8 마감 및 삭제 처리

활성 상세는 시작/마감일과 “남은기간”, 목록은 `내일마감`, 날짜 마감, `상시채용`을 표시했다. 만료 상세 `48997208`은 “마감되었습니다”로 남아 있었다. [관찰됨] 삭제 시 404/리다이렉트, 검색에서 즉시 제거 여부, 자동갱신과 ID 유지, 수정시각 노출은 미확인이다.

### 4.9 접근 제한

CAPTCHA·로그인 게이트는 공개 검색/상세에서 관찰되지 않았다. robots.txt는 일반 봇에 검색 쿼리 일부를 금지하고 공개 채용목록·상세는 허용하며, AI/LLM 봇별 별도 정책과 스크레이퍼 차단을 명시한다. [공식 파일](https://www.jobkorea.co.kr/robots.txt) 기술적 접근 가능성과 생산 수집 권한은 별개다. 세션 토큰·서명 파라미터는 조사하지 않았다.

미래 연동 가능성 분류는 **public HTML may be technically feasible but requires permission review**이다. 공식 API 계약이 성립하면 그 경로가 우선한다.

### 4.10 이용약관과 공식 접근 수단

상세 페이지는 “동의 없이 무단전재·재배포·재가공할 수 없으며 구직활동 외 사용 불가”라고 표시했다. [관찰됨] 회사 약관은 서비스에서 얻은 정보의 사전동의 없는 복사·복제·제공 및 영리 이용을 제한한다. [공식 약관](https://www.albamon.com/service-center/terms/member) 같은 운영사 통합 약관이 두 사이트를 열거하지만, 잡코리아 현행 개별 약관 적용 범위는 법무 검토가 필요하다.

푸터에는 “채용정보 API”가 있고 공식 회사 도메인의 XML 샘플은 `JK_GI_XML_List.asp`와 `GI_No`, 회사명, 제목, 직무/경력/급여 코드, 지역코드, 등록·마감일, 원문 URL 등을 예시한다. [공식 API 샘플](https://company.jobkorea.co.kr/Network/Popup_Xml_sample_1.asp) 그러나 현행 신청 화면·계약·쿼터·지역 범위·상세 API·재배포 권리는 미확인이다. [제휴 문의](https://www.worxphere.ai/partnership)는 공식 창구다.

### 4.11 위험과 미확인 사항

검색 순서 변동·광고 중복, JSON-LD와 표시 급여 차이, 다중 근무처 축약, 공식 API의 현행성, 갱신 ID 규칙, 삭제 전이가 핵심 위험이다. API 샘플이 존재한다고 무계약 사용 가능하다고 해석해서는 안 된다.

### 4.12 MVP 적합도

조건부 2순위. 상세 데이터 품질은 높지만 공식 API 계약과 재사용 허가를 먼저 확정해야 한다. HTML 기반 연동은 “기술적으로 가능하나 허가 검토 필요”로 분류한다.

## 5. 알바몬

### 5.1 진입 경로

- 공식: `https://www.albamon.com/`; 지역 검색: `https://www.albamon.com/jobs/area`; 상세: `https://www.albamon.com/jobs/detail/{id}`. [관찰됨]
- 지역 UI에서 서울·경기를 동시에 선택할 수 있고 URL에는 `areas=I000,B000` 형태가 관찰됐다. 구·동 선택 UI도 있다. [관찰됨]
- 검색·상세는 로그인 없이 접근 가능하다. 약관은 `m.albamon.com`을 별도 모바일 웹으로 공식 열거한다. [관찰됨+공식 문서]
- 데스크톱은 넓은 다단 지역 선택·목록/지도 전환을 보였지만 모바일 화면의 카드 필드·페이지 방식은 별도 검사하지 않았다. [관찰됨+미확인]
- 상세 canonical은 쿼리를 제거한 `/jobs/detail/{id}`였다. 검색 조건은 URL에 반영되지만 클라이언트 상태와 결합되므로 URL만으로 완전 재현되는지는 미확인이다.

### 5.2 검색 결과 구조

지역 화면은 클라이언트 중심 하이브리드다. 공개 페이지에서 코드용 XHR과 `POST https://bff-general.albamon.com/recruit/search`가 관찰됐다. 이는 **Observed internal endpoint**이며 공식 API가 아니다. 요청 본문은 검색 종류·조건 객체를 담는 JSON 형태였지만, 로그인 상태에 종속될 수 있는 필드는 조사/기록에서 제외했다. 지역코드용 `GET https://api-code.albamon.com/codes/areas/korean/sigu/codes`도 **Observed internal endpoint**다. [관찰됨]

GraphQL은 관찰되지 않았다. 상세 JSON-LD는 HTML에 포함됐고, 지도는 동적 컴포넌트와 외부 지도 링크가 함께 보였으나 주소/지도용 별도 내부 요청 패턴은 기록하지 않았다.

화면에는 지역·업직종·근무기간·상세조건, 급여·근무시간·등록 경과, 리스트/지도 전환이 있다. 키워드/지역/페이지는 URL에 일부 보존되지만 공식 파라미터 명세, 급여·고용·등록일·정렬 본문 스키마는 미확인이다.

### 5.3 페이지네이션

번호 1~5와 다음 버튼, URL `page=2`가 관찰됐고 카드 20개의 고유 상세 ID를 한 상태에서 확인했다. 클릭 직후 URL/클라이언트 상태가 비동기적으로 어긋나는 사례가 있어 인접 페이지 중복 검증은 불확정이었다. [관찰됨] 이는 빈 페이지·같은 페이지 오인 위험을 높인다. 수집기라면 응답의 페이지/총건수 신호와 첫·끝 ID 변화까지 확인해야 한다. 최대 페이지·전체 결과수·빈 페이지·순서 재요청 안정성은 미확인이다. 상단 `TOP-Logo`, 광고 상품과 일반 리스트가 분리되어 프로모션 공고를 유기 결과로 중복 계산할 수 있다.

### 5.4 목록 필드

목록에서 공고 ID/링크, 제목, 회사, 시·구·동 또는 `전체`, 급여 유형과 금액, 근무시간/협의, 등록 경과, 광고 상품 구분이 직접 보였다. 일부 카드에는 근무일/브랜드/로고가 있다. 정확주소, 학력·경력, 상세 고용형태, 마감일은 상세가 필요하거나 카드 유형별로 다르다.

### 5.5 상세 페이지

표본 JSON-LD `JobPosting`은 제목, 게시/마감일, `PART_TIME`, 경력, `jobLocation` 배열, `PostalAddress`, 설명, `baseSalary`(KRW/DAY/value), `workHours`, 회사명을 제공했다. 화면은 일급 원문, 기간, 요일, 시간/휴게, 업직종, 고용형태, 학력, 정확주소, 지도, 상세 iframe을 제공했다. canonical과 OG URL도 있었다. [관찰됨]

지도 링크에 위·경도가 있고 “지도는 근무지 위치를 나타내며 회사 소재지와 일치하지 않을 수 있음”을 명시했다. 회사주소는 별도 섹션에 달랐다. 이 구분은 매우 유용하다. 담당자 연락처가 공개되는 공고가 있으나 본 제품은 이를 수집·저장하지 않아야 한다.

### 5.6 급여 구조

목록에서 `시급 13,000원`, `일급 110,000원`, `월급 2,200,000원`, `연봉 46,000,000원` 형태가 관찰됐다. 상세 표본은 표시 텍스트와 JSON-LD 수치/기간을 모두 제공했다. 상세 요강에는 수당 구성 같은 혼합 보상이 추가될 수 있어 `originalText`와 상세 설명의 보상 문구를 분리 보존해야 한다. 주급·건별·회사내규·협의형의 구조화 방식은 이번 표본에서 미확인이다.

### 5.7 위치 구조

표본은 도로명 주소, 읍/시, 지도 좌표가 있어 `exact_coordinate`였다. 목록의 `경기 전체`, `서울 전체`는 `city` 또는 다지역/미정일 수 있어 지도 제외가 안전하다. 지점 다중·역세권·면접 후 결정 위치의 빈도는 미확인이다. 회사주소와 근무주소가 명시적으로 분리되므로 회사주소를 대체 좌표로 사용하지 않는다.

### 5.8 마감 및 삭제 처리

활성 상세는 `~08/24`, `D-19`, 날짜 마감을 표시한다. 닫힌 상세 URL의 존속, 404/리다이렉트, 검색 제거 시점, 상시채용, 자동갱신·ID 유지·수정시각은 미확인이다.

### 5.9 접근 제한

robots.txt는 AI/LLM 봇에 `/jobs`를 허용하지만 일반 규칙에서 상세의 특정 쿼리, 상세 콘텐츠·담당자·지원 경로를 제한한다. [공식 파일](https://www.albamon.com/robots.txt) 공개 목록은 브라우저 렌더링과 내부 BFF에 의존한다. CAPTCHA·헤드리스 차단·회전 토큰은 관찰하지 않았고 우회도 시도하지 않았다. 미래 연동은 “브라우저 자동화가 필요할 가능성/기술적 불안정”이 아니라, **공식 피드를 먼저 찾고 없으면 허가 후 공개 HTML/BFF 안정성을 재평가**해야 한다.

현재 증거에 따른 정형 분류는 **technically unstable**이다. 계약형 공식 피드가 확인되면 이 평가는 바뀔 수 있다.

### 5.10 이용약관과 공식 접근 수단

약관은 서비스에서 얻은 정보의 사전동의 없는 복사·복제·제공 및 영리 이용을 제한한다. [공식 약관](https://www.albamon.com/service-center/terms/member) 상세에도 무단전재·재배포·재가공 금지와 구직 외 연락처 사용 제한이 있다. [관찰됨]

공개 채용 API 문서는 발견하지 못했다. 공식 제휴 창구는 존재하며 XML/API 형태 제휴 가능성을 약관이 일반적으로 언급한다. [공식 제휴 문의](https://www.worxphere.ai/partnership) 따라서 “API 없음”이 아니라 “공개 문서화된 API 미발견, 계약형 피드 미확인”이다.

### 5.11 위험과 미확인 사항

내부 BFF 변경, 필터 상태 재현, 광고/유기 중복, 공개 연락처의 개인정보 혼입, 폐쇄·갱신 ID 규칙, 다중 근무지 표현, 공식 피드 여부가 핵심이다.

### 5.12 MVP 적합도

3순위. 시간·급여·위치 제품 적합성은 높지만 공식 접근권과 안정된 인터페이스가 확인되지 않았다. 허가 없는 내부 엔드포인트 연동은 권고하지 않는다.

## 6. 고용24

### 6.1 진입 경로

- 공식: `https://www.work24.go.kr/`; 상세검색: `https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchList.do`; 모바일: `https://m.work24.go.kr/...`. [관찰됨]
- 지역 예: `?region=11260&webIsOut=region`. 서울·경기의 상위/하위 지역 코드는 공식 공통코드/API로 확인해야 하며 임의 생성하지 않는다. [관찰됨]
- 검색·상세는 비로그인 공개. 지원과 일부 채용담당자 정보는 로그인 필요하다. [관찰됨]
- 데스크톱과 `m.work24.go.kr`의 검색·상세가 같은 경로 계열과 핵심 표 필드를 제공하는 것을 확인했다. 모바일은 내비게이션이 축약되지만 핵심 상세 내용은 공개됐다. [관찰됨]
- 공식 API는 `region` 다중검색을 문서화하므로 서울·경기 동시 질의가 가능하다. 웹 UI도 지역 복수 선택 구조다. [공식 문서+관찰됨]

### 6.2 검색 결과 구조

공개 페이지는 의미 있는 HTML 폼/표와 서버 경로를 제공한다. 검색 결과에는 총건수, 회사/제목/정보제공처, 급여, 경력·학력, 근무형태·지역, 등록·마감일이 보인다. [관찰됨] 공식 연동은 HTML 구조가 아니라 XML API를 사용한다.

공식 응답은 XML이며 GraphQL/JSON을 공식 형식으로 제공한다는 근거는 없다. 공개 화면 내부 XHR은 조사하지 않았다. 지도 버튼의 좌표·주소 별도 요청도 미확인이다.

공식 요청 패턴은 `GET /cm/openApi/call/wk/callOpenApiSvcInfo210L01.do`이며 `authKey`는 보고서에 기록하지 않는다. 목록 필수는 `callTp=L`, `returnType=XML`, `startPage`, `display`; 선택은 `region`, `occupation`, `salTp`, `minPay`, `maxPay`, `education`, `career`, `empTp`, `holidayTp`, `regDate`, `keyword`, `untilEmpWantedYn`, 날짜 범위, `sortOrderBy`, `workHrCd` 등이다. [공식 API 문서](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiSvcInfo.do?apiSvcId=000000000000000000000000000060&fullApiSvcId=000000000000000000000000000000%5E000000000000000000000000000001&upprApiSvcId=000000000000000000000000000059)

### 6.3 페이지네이션

공식 API는 `startPage` 기본 1·최대 1000, `display` 기본 10·최대 100, 응답 `total/startPage/display`를 명시한다. [공식 문서] 이는 이름상 페이지 번호지만 문구에 “검색 시작위치”도 있어 실제 의미를 승인 후 2페이지 fixture로 확인해야 한다. 웹 표본은 10개 결과와 총 754건을 보였다. 빈 페이지, 최대 이후 오류, 페이지 중복·정렬 변동은 미확인이다. 민간 연계 공고가 섞이므로 `infoSvc`/정보제공처로 출처를 분리해야 한다.

### 6.4 목록 필드

공식 목록은 구인인증번호, 회사, 사업자번호, 업종, 제목, 급여 유형·원문·min/max, 지역, 근무형태, 학력 min/max, 경력, 등록/마감, 정보제공처, PC/모바일 URL, 우편·도로명·기본·상세주소, 고용형태코드, 직종코드, 최종수정일을 문서화한다. [공식 문서] 사업자번호는 MVP에 불필요하며 원시 fixture에서도 마스킹/제외한다.

### 6.5 상세 페이지

공개 상세는 의미 있는 표로 직무내용, 모집직종/관련직종, 경력·학력, 고용형태, 급여, 근무시간·휴게, 주간 근무형태, 정확주소, 역·출구, 접수마감, 등록일시, 구인인증번호를 제공했다. 표본은 “현재 주소”와 “2026년 10월 이후 송파구 문정동으로 변경 예정”을 함께 포함해 `location_undecided` 전이 사례다. [관찰됨]

Schema.org JSON-LD·위경도·별도 주소 API는 이번 조사에서 확인하지 못했다. 지도 버튼은 있으나 좌표를 추출하지 않았다. 회사 주소와 근무 예정지를 별도 취급한다.

### 6.6 급여 구조

웹 표본: `월급 238만원 ~ 257만원`, `시급 10,500원 ~ 10,500원`, `연봉 5,580만원 ~ 6,000만원`, `채용시까지` 공고의 월급 고정값. 공식 API는 `salTp` H/D/M/Y, 표시 `sal`, `minSal`, `maxSal`을 제공한다. [공식 문서] 주급·건별·회사내규·인센티브는 API 명세에서 구조화 유형으로 확인되지 않아 원문에서 `unknown/mixed/company_policy`로 보존한다.

### 6.7 위치 구조

공식 API가 우편주소, 도로명, 기본, 상세주소를 분리하므로 `exact_address` 품질이 가장 예측 가능하다. 위·경도는 문서화되지 않아 지오코딩이 필요하다. 상세에는 역·출구가 있고, 다중 근무 예정지와 변경 예정 서술도 존재한다. 민간연계 공고의 `서울 등`, 여러 시·구는 `multiple_locations` 또는 `city`; 변경 예정은 `location_undecided`와 현재 주소를 함께 기록한다. 지도에는 정확주소만 기본 노출하고 변동 예정은 제외/경고한다.

### 6.8 마감 및 삭제 처리

날짜 마감과 `채용시까지 (마감시간: 24시)`가 관찰됐고 API는 `untilEmpWantedYn`, `closeDt`, 등록일, 최종수정일을 제공한다. [관찰됨+공식] 오래된 상세 URL이 검색 엔진에 남아 접근되는 사례가 있어 마감 후 상세 존속 가능성이 있다. 제거/404/리다이렉트, 검색 제거 지연, 갱신 ID 유지 규칙은 미확인이다.

### 6.9 접근 제한

공개 검색/상세는 로그인 없이 가능하고 CAPTCHA를 보지 못했다. robots.txt는 기본 허용 후 `/cm/common/`, `/sa/`, `/ei/`, 통합검색 일부를 제한하고 사이트맵을 명시한다. [관찰됨] 공개 페이지의 일부 브라우저 검사 도구가 사이트 스크립트와 충돌했지만 일반 HTML 접근은 가능했으므로 이를 봇 차단으로 해석하지 않는다. API는 인증키·승인·활용제한 제도가 있다.

미래 연동 가능성 분류는 **official API preferred**이다.

### 6.10 이용약관과 공식 접근 수단

고용24는 기업회원 가입→인증키 신청→담당자 심사→발급을 공식 안내한다. [공식 Open API 안내](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do) FAQ는 공공기관·학교·직업정보제공사업등록 사업체 등이 채용공고 API를 이용할 수 있다고 설명한다. [공식 FAQ](https://m.work24.go.kr/cm/c/a/0130/selectBbttInfo.do?bbsClCd=VJQMx%2Fa2p6AfqLQqwR8sSQ%3D%3D&ntceStno=383&searchKeyword=)

공공데이터포털 항목은 무료·실시간·XML·LINK형이지만 이용허락범위를 제3자 권리 포함/공공누리 제4유형으로 표시한다. [공공데이터포털](https://www.data.go.kr/data/3038225/openapi.do?recommendDataYn=Y) 따라서 상업 서비스, 필드 정규화(변경), 캐시/재배포, 원문 일부 표시가 허용되는지 서면 확인이 필요하다. [법무 검토 필요]

### 6.11 위험과 미확인 사항

승인 자격, 제4유형과 서비스 모델의 양립, API 상세 호출의 정확 필수 파라미터, `startPage` 의미, 민간연계 공고의 재사용 권리·중복, 주소 변경 예정, API 장애 대응이 핵심이다.

### 6.12 MVP 적합도

1순위. 승인과 이용조건을 충족할 때 가장 안정적이다. “official API preferred”로 분류한다.

## 7. 소스별 필드 매트릭스

등급: **직접** 목록에서 직접, **부분** 축약/일부 카드, **상세** 상세 필요, **없음**, **모호**.

| 필드 | 잡코리아 | 알바몬 | 고용24 |
|---|---|---|---|
| source posting ID | 직접(URL) | 직접(URL) | 직접/API |
| canonical URL | 상세 JSON-LD URL | 상세 canonical | API URL/상세 URL |
| 제목/회사 | 직접 | 직접 | 직접 |
| 짧은 설명 | 모호 | 부분(JSON-LD 설명) | 상세 직무내용 |
| 직종/카테고리 | 직접 | 직접/상세 | 직접/API 코드 |
| 고용형태 | 부분→상세 | 부분→상세 | 직접/API |
| 경력/학력 | 경력 직접, 학력 상세 | 상세 | 직접/API |
| 급여 원문 | 부분 | 직접 | 직접/API |
| 급여 type/min/max | 상세 JSON-LD(일부) | 목록 type+값, 상세 JSON-LD | 직접/API |
| 근무지역 | 직접(축약 가능) | 직접(축약 가능) | 직접/API |
| 상세 근무주소 | 상세 | 상세 | 직접/API |
| 인근역 | 상세 | 모호/상세 | 상세, API 검색 파라미터 |
| 근무일/시간 | 상세 | 목록 시간·상세 요일 | 상세; API 근무형태/시간대 |
| 게시일 | 직접 | 상대시간 직접·JSON-LD 날짜 | 직접/API |
| 수정일 | 없음 | 없음 | API |
| 마감/상시 | 직접 | 상세 | 직접/API |
| 광고/프로모션 | 직접 `AD` 등 | 상품영역 구분 | 관찰되지 않음 |
| 회사 로고 | 직접 | 일부 직접 | 일부 직접 |
| 원격근무 | 모호 | 일부 제목/조건 | 웹 필터, 결과 필드 미확인 |
| 다중근무지 | 부분 `외 N`·상세 본문 | 모호 | 직접/상세 가능 |
| 신청 링크/방식 | 직접 | 상세/버튼 | 직접/상세 |
| 좌표 | 상세 지도 링크 표본 | 상세 지도 링크 표본 | 없음/미확인 |
| 실제 근무지 vs 본사 | 상세 비교 필요 | 명시적으로 분리 | 근무예정지/기업정보 분리 |
| 폐쇄 상태 | 상세 마감 표시 | 미확인 | 상세/마감일 기반 |

## 8. 공통 CanonicalJob 스키마

```ts
type JobSource = "jobkorea" | "albamon" | "work24";
type LocationAccuracy =
  | "exact_coordinate" | "exact_address" | "neighborhood" | "district"
  | "city" | "station_area" | "multiple_locations" | "headquarters_only"
  | "location_undecided" | "unavailable";
type SalaryType =
  | "hourly" | "daily" | "weekly" | "monthly" | "annual"
  | "per_task" | "negotiable" | "company_policy" | "mixed" | "unknown";
type PostingStatus =
  | "active" | "closing_soon" | "expired" | "closed" | "removed" | "unknown";

interface CanonicalSalary {
  originalText: string;
  type: SalaryType;
  minimumAmount: number | null;
  maximumAmount: number | null;
  currency: "KRW" | null;
  negotiable: boolean;
  normalizedMonthlyMinimum: number | null;
  normalizedMonthlyMaximum: number | null;
  normalizationBasis: string | null;
  normalizationConfidence: "high" | "medium" | "low" | null;
}

interface Workplace {
  name: string | null;
  addressOriginalText: string | null;
  roadAddress: string | null;
  parcelAddress: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  nearestStation: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: LocationAccuracy;
  coordinateSource: "source" | "geocoded" | null;
}

interface CanonicalJob {
  id: string;
  source: JobSource;
  sourcePostingId: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  title: string;
  companyName: string;
  normalizedCompanyName: string | null;
  descriptionSummary: string | null;
  categories: string[];
  employmentTypes: string[];
  experienceRequirement: string | null;
  educationRequirement: string | null;
  salary: CanonicalSalary;
  workDays: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  shiftType: string | null;
  addressOriginalText: string | null;
  roadAddress: string | null;
  parcelAddress: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  nearestStation: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: LocationAccuracy;
  hasExactWorkplaceAddress: boolean; // exact_coordinate/exact_address에서 파생
  workplaceCount: number | null;
  workplaces: Workplace[]; // 다중 근무지 근거가 있어 추가한 MVP 필드
  postedAt: string | null;
  modifiedAt: string | null;
  expiresAt: string | null;
  postingStatus: PostingStatus;
  promoted: boolean | null;
  remote: boolean | null;
  collectedAt: string;
  lastVerifiedAt: string;
  rawPayloadReference: string | null;
}
```

필드별 근거·획득 위치·신뢰도·PII·MVP 판단은 다음과 같다. `JK/AM/W24`는 소스를 뜻한다.

| 필드군 | 제공 소스·위치 | 형태/신뢰도 | PII | MVP |
|---|---|---|---|---|
| id/source/sourcePostingId | 전부 목록/API | 구조화/높음 | 아니오 | 필수 |
| sourceUrl/canonicalUrl | 전부 목록·상세/API | URL/높음; 추적쿼리 제거 | 아니오 | 필수 |
| title/companyName | 전부 목록 | 구조화 또는 파싱/높음 | 아니오 | 필수 |
| normalizedCompanyName | 전부에서 파생 | 파생/중간 | 아니오 | 필수(중복) |
| descriptionSummary | JK/AM JSON-LD, W24 상세 | 원문 파싱/중간 | 개인명 혼입 검사 | 선택 |
| categories | 전부 목록/API | 코드+표시/높음~중간 | 아니오 | 필수 |
| employmentTypes | 전부 상세, W24 API | 구조화/높음 | 아니오 | 필수 |
| experience/education | 전부 상세, W24 API | 구조화/높음 | 아니오 | 필수 |
| salary.* | 전부 상세; W24 API 최상 | 원문+구조/원문 높음·정규화 별도 | 아니오 | 필수 |
| workDays/start/end/shift | JK/AM 상세, W24 상세·일부 API | 파싱/중간 | 아니오 | 필수 |
| addressOriginalText | 전부 상세, W24 API | 원문/높음 | 사업장 주소, 일반적으로 비PII; 개인사업장 주의 | 필수 |
| road/parcel/city/district/neighborhood | 전부 파싱, W24 API 주소 | 구조+주소 파서/높음~중간 | 위와 같음 | 필수 |
| nearestStation | JK/W24 상세, AM 미확인 | 파싱/중간 | 아니오 | 선택 |
| latitude/longitude | JK/AM 지도 표본, W24 지오코딩 | 출처좌표 높음; 지오코딩 중간 | 민가 주소 가능성 주의 | 지도 필수 |
| locationAccuracy/hasExactWorkplaceAddress | 전부 중앙 분류 | 파생/근거 기반; exact_coordinate/exact_address만 true | 아니오 | 필수 |
| workplaceCount/workplaces | JK 다중, W24 다중, AM 잠재 | 파싱/중간 | 주소 주의 | 필수 |
| postedAt/expiresAt | 전부 상세/API | 구조화/높음 | 아니오 | 필수 |
| modifiedAt | W24 API; JK/AM 없음 | 구조화/높음 | 아니오 | 필수 nullable |
| postingStatus | 날짜+상세 재검증 | 파생/중간 | 아니오 | 필수 |
| promoted | JK/AM 목록; W24 미확인 | 표시 파싱/중간 | 아니오 | 필수 nullable |
| remote | 세 소스 일부 조건/본문 | 파싱/낮음~중간 | 아니오 | 필수 nullable |
| collectedAt/lastVerifiedAt | 수집기 생성 | 구조화/높음 | 아니오 | 필수 |
| rawPayloadReference | 원시 fixture 저장소 참조 | 구조화/높음; 원문 자체는 별도 | 원시 데이터 PII 제거 필수 | 필수 |

전화·이메일·담당자명·지원자 수·사업자번호는 제품 목적에 불필요하므로 CanonicalJob에서 제외한다. `workplaces`는 제시된 최소 모델에 없지만 다중 근무지를 손실 없이 표현할 명확한 제품 목적과 관찰 근거가 있어 추가했다.

## 9. 급여 보존 및 정규화 방안

`originalText`는 화면/API 원문을 공백만 최소 정리해 영구 보존하며, 파싱 실패해도 공고를 버리지 않는다. 유형과 min/max는 표시 단위의 원화 액수다. `회사 내규`, `면접 후 결정`, `기본급+인센티브`는 숫자 0으로 바꾸지 않는다.

향후 월 환산은 별도 정책 버전으로 계산한다. 연봉은 12분할, 월급은 그대로, 시급/일급은 **공고에 명시된 주당 일수·시간이 있을 때만** 월 평균 주수 같은 명시된 기준을 사용한다. 근무시간이 없거나 수당·인센티브 비중이 불명확하면 null 또는 낮은 신뢰도로 둔다. `normalizationBasis`에 `hourly × statedHoursPerWeek × 52 / 12`처럼 정확한 산식을 기록한다. 세전 추정치이며 실수령액·정확 급여로 표시하지 않는다. 범위는 범위로 유지한다.

## 10. 위치 정확도 분류 및 지도 표시 방안

| 분류 | 판단 | 지도 정책 |
|---|---|---|
| exact_coordinate | 소스가 실제 근무지 좌표를 제공 | 실마커, 출처 표시 |
| exact_address | 전체 도로명/지번 주소 | 지오코딩 후 실마커, 지오코딩 표시 |
| neighborhood/district/city | 해당 행정구역까지만 | 중심점 사용 시 “추정” 클러스터; 기본은 목록만 |
| station_area | 역/도보권만 | 역 중심 반경형 추정, 정확 마커 금지 |
| multiple_locations | 둘 이상 | `Workplace[]` 각각 표시; 미분리면 지도 제외 |
| headquarters_only | 근무지 아닌 본사 주소만 | 지도 제외 |
| location_undecided | 면접 후/향후 결정·변경 | 지도 제외 |
| unavailable | 정보 없음/숨김 | 지도 제외 |

잡코리아: 정확주소+소스 좌표 표본은 신뢰 가능하나 `외 N`과 상세 본문 다중지점은 분해 전 제외. 알바몬: 근무지 좌표 표본은 좋고 본사주소 분리가 명확; `서울 전체/경기 전체`는 제외. 고용24: 정확주소는 지오코딩 필요; 민간 연계·변경 예정·여러 지역은 추정/제외. 어떤 소스도 임의 좌표를 생성하지 않는다.

`exact workplace address availability` 필터는 소스 검색조건에 기대지 않고 `hasExactWorkplaceAddress = locationAccuracy in {exact_coordinate, exact_address}`로 중앙 파생한다. 건물/층이 빠졌더라도 단일 도로명 주소를 식별할 수 있으면 `exact_address`; 구·동·역 수준은 false다.

## 11. 중복 판별 방안

동일 소스 정확 중복 키는 `(source, sourcePostingId)`를 1순위, 정규화 canonical URL을 2순위로 사용한다. 광고와 유기 영역에 같은 ID가 있으면 **exact duplicate**로 하나의 공고에 `promoted=true`를 병합하되 노출 로그는 별도 보존한다.

교차 소스는 정규화 회사명+제목+정확 근무주소+급여 원문/범위+근무시간+고용형태+게시기간+채용대행사+근무지명을 점수화한다.

- exact duplicate: 같은 소스 ID 또는 계약상 공유된 원천 ID.
- probable duplicate: 강한 다필드 일치. 자동 병합하지 않고 UI에서 “유사 공고”로 묶음.
- related posting: 같은 회사/지점이나 직무·시간·급여가 다름.
- uncertain match: 주소/급여가 없거나 대행사 재게시 가능. 분리 유지.

같은 공고의 다지역 노출, 다카테고리 노출, 광고/유기 복사, 새 ID 갱신, 대행사 재게시, 지점별 별도 모집을 각각 별도 규칙으로 로깅한다. 특히 고용24 민간연계 공고는 원출처 표시를 cross-source 후보에 포함한다.

## 12. 공고 생명주기 관리 방안

`active`: 마감 전/채용시까지이며 상세 접근 가능. `closing_soon`: 제품 정책(예: 72시간 이내) 파생. `expired`: 마감일 경과. `closed`: 사이트가 명시적으로 마감/종료. `removed`: 과거 존재 근거가 있으나 반복 검증에서 404/명시 삭제. `unknown`: 일시 오류·차단·판단 불가.

마감일 경과만으로 삭제하지 않고 원문 링크를 유지한다. `expired`와 `closed`는 다르다. 404 1회는 네트워크 오류와 구별하고 지수 백오프 후 확인한다. 리다이렉트는 최종 URL과 상태를 저장한다. 갱신 공고가 같은 ID인지 새 ID인지는 소스별 fixture로 확인 전 가정하지 않는다. W24 `modifiedAt`을 증분 동기화 힌트로 쓰되 삭제 탐지는 별도 재검증한다.

## 13. 소스 어댑터 아키텍처

```ts
interface JobSourceAdapter {
  readonly source: JobSource;
  search(input: SearchInput): Promise<SearchPageResult>;
  fetchDetail(sourcePostingId: string): Promise<SourceJobDetail>;
  normalize(listing: SourceJobListing, detail?: SourceJobDetail): Promise<CanonicalJob>;
}
```

- 소스별: 인증/허용된 요청, 필터 코드, 페이지 토큰, HTML/XML/JSON 파서, 상세 URL, 광고 판별, 소스 상태 코드.
- 중앙: CanonicalJob 검증, 급여 **정규화**(파싱은 어댑터+공통 라이브러리), 주소 표준화, 허가된 지오코딩, 위치 정확도, 중복, 생명주기, PII 제거.
- 페이지네이션은 어댑터가 소스 응답 의미를 책임지고 중앙 오케스트레이터가 예산·중단·재시도를 책임진다.
- 급여 원문 추출/소스 코드 해석은 어댑터, 공통 `SalaryType` 매핑과 월 환산은 중앙 버전 정책이다.
- 주소 원문 추출은 어댑터, 행정구역 파싱/지오코딩은 중앙. 좌표는 `source`와 `geocoded`를 구분한다.
- 원시 응답은 접근권에 맞는 짧은 fixture만 암호화 저장하고 연락처·담당자·사업자번호를 제거한다. Canonical에는 URI/해시 참조만 둔다.
- fixture 테스트는 목록 1·2페이지, 급여 각 유형, 정확/부분/다중/미정 주소, 활성/마감 공고를 소수 포함한다. 원문→파싱→Canonical snapshot과 필수 필드 손실을 검사한다.
- 구조 변경 탐지는 선택자/필드 존재율, JSON-LD `@type`, API XML 스키마, null 비율, 페이지 중복률, 주소/급여 파싱 실패율의 임계치로 알린다.
- 어댑터별 큐·회로차단기·버전·관측치를 분리해 하나가 깨져도 다른 소스의 검색과 최신성은 유지한다. 실패한 소스는 마지막 검증 시각과 함께 UI에 표시한다.

## 14. 권장 연동 순서

### 점수(1 낮음, 5 높음)

| 기준 | 잡코리아 | 알바몬 | 고용24 |
|---|---:|---:|---:|
| 목록 접근성 | 4 | 3 | 5 |
| 상세 접근성 | 5 | 5 | 5 |
| 필드 완전성 | 4 | 4 | 5 |
| 급여 품질 | 4 | 5 | 5 |
| 위치 품질 | 4 | 5 | 4 |
| 페이지 신뢰성 | 3 | 2 | 5 |
| 기술 안정성 | 3 | 2 | 5 |
| 공식 접근 가용성 | 3 | 1 | 5 |
| 약관 명확성 | 3 | 3 | 4 |
| MVP 적합도 | 3 | 2 | 5 |

근거: 잡코리아 목록/상세는 공개이고 JSON-LD가 풍부하나 검색 순서·중복과 API 현행 조건이 불명확하다. 알바몬 상세는 급여·근무시간·좌표가 매우 좋지만 목록 BFF/클라이언트 상태와 공식 API 부재가 약점이다. 고용24는 공개 HTML과 공식 API 명세·수정일·주소·급여가 가장 완전하나 좌표는 없어 4점, 이용허락의 상업/변형 제한이 있어 약관 4점이다.

| 기준 | 점수별 근거 |
|---|---|
| 목록 접근성 | JK 4: 비로그인·URL 페이지이나 광고 혼합. AM 3: 공개지만 CSR/BFF 의존. W24 5: 공개 HTML+공식 목록 API. |
| 상세 접근성 | JK 5: 비로그인+JSON-LD. AM 5: 비로그인+JSON-LD+지도. W24 5: 비로그인 의미 HTML, API 상세 표방. |
| 필드 완전성 | JK 4: 핵심 풍부, 수정일·다중지점 구조 부족. AM 4: 시간/요일/급여/지도 풍부, 수정일 불명. W24 5: 주소·급여·등록/마감/수정일 명세. |
| 급여 품질 | JK 4: 원문+표본 JSON-LD이나 표시/수치 차이. AM 5: 목록 type/value+상세 JSON-LD/수당 본문. W24 5: 원문·type·min/max 공식. |
| 위치 품질 | JK 4: 정확주소·역·좌표 표본, `외 N` 손실. AM 5: 근무지 주소·좌표와 본사주소 분리. W24 4: 주소 필드 우수, 좌표 없음. |
| 페이지 신뢰성 | JK 3: 명시 `Page_No`이나 중복·순서 변화. AM 2: 클라이언트 상태/비동기 불확정. W24 5: `total/startPage/display` 공식 명세. |
| 기술 안정성 | JK 3: 공개 DOM은 안정적이나 검색/API 계약 미확인. AM 2: 내부 BFF와 CSR 의존. W24 5: 버전 가능한 XML 계약면. |
| 공식 접근 가용성 | JK 3: 공식 샘플은 있으나 신청/계약 미확인. AM 1: 공개 문서형 API 미발견. W24 5: 신청·심사·명세·공공데이터 항목. |
| 약관 명확성 | JK 3: 금지 문구 명확하나 API 예외조건 불명. AM 3: 금지 문구/제휴 창구는 명확, 피드 조건 불명. W24 4: 승인·제4유형 명시, 상업/변형 적용은 확인 필요. |
| MVP 적합도 | JK 3: 계약 성립 시 좋음. AM 2: 데이터는 좋지만 공식 경로 부재. W24 5: 승인 전제에서 필터·필드·운영성이 최상. |

순서: (1) 고용24 승인·법적 범위 확인 후 API, (2) 잡코리아 공식 API/제휴 계약이 확인되면 API, (3) 알바몬 계약형 피드가 확인될 때만 연동. HTML/BFF는 양사 서면 허가와 공식 피드 부재가 확인된 뒤 제한적 대안으로 검토한다.

## 15. 다음 기술 작업

1. 고용24에 사업자 자격, API 승인, 서울+경기·전직종 사용, 캐시 기간, 원문 링크/출처표시, 정규화·검색 인덱스·지도 지오코딩, 상업 서비스 허용 여부를 서면 질의한다.
2. 승인 후 인증정보를 저장소에 넣지 않고 목록 `display=10`의 1·2페이지와 상세 최대 10건만 fixture로 수집한다.
3. API 문서와 실제 XML의 `startPage`, `total`, 주소·급여·수정일, 빈 페이지를 계약 테스트한다.
4. 연락처·담당자·사업자번호 제외 검사를 먼저 만들고, 필드 충족률·정확주소율·다중지점율을 보고한다.
5. 이 결과를 사용자 검토 후에만 스키마/앱/수집기 구현 계획으로 전환한다.

## 16. 추가 확인이 필요한 사항

- 잡코리아 API의 현행 신청 URL, 계약비용, 쿼터, 상세/삭제 피드, 서울·경기 다중필터, 재배포·캐시·지도 사용권. [미확인]
- 알바몬 공식/파트너 XML·API 피드의 존재, 조건, 광고/유기 구분, 수정/삭제 이벤트. [미확인]
- 고용24 승인 대상에 본 서비스 운영주체가 해당하는지, 공공누리 제4유형과 유료/광고 기반 서비스 및 정규화가 양립하는지. [법무 검토 필요]
- 세 소스의 정확주소·좌표·다중지점 실제 비율, 모바일 필드 차이, RSS 존재. [미확인]
- 빈 페이지 응답, 최대 페이지, 재요청 순서, 갱신 ID, 404/410/리다이렉트 전이. [미확인]
- 주급·건별·혼합보상·회사내규 표본의 각 소스 구조화 방식. [부분 확인]

## 17. Evidence Log

| 소스 | URL/정제 패턴 | 유형 | 날짜 | 관찰 | 분류 | 신뢰 | 공식 문서 |
|---|---|---|---|---|---|---|---|
| 잡코리아 | `https://www.jobkorea.co.kr/Search/?stext=서울` | 검색 | 2026-08-05 | 총건수, 필터, 카드, `Page_No`, AD, 급여/지역/마감 | Observed | 높음 | 아니오 |
| 잡코리아 | `/Search?stext=서울&Page_No={1,2}` | 페이지 | 2026-08-05 | 각 DOM 32 ID, 5개 중복, 재요청 선두 순서 변화 | Observed | 높음 | 아니오 |
| 잡코리아 | `https://www.jobkorea.co.kr/Recruit/GI_Read/49715720` | 상세 | 2026-08-05 | JobPosting JSON-LD, 월급 범위, 정확주소, 역, 지도좌표, 두 근무처 본문 | Observed | 높음 | 아니오 |
| 잡코리아 | `.../GI_Read/48997208` | 마감 상세 | 2026-08-05 | 회사내규/면접후결정, 마감 상세 존속 | Observed | 중간 | 아니오 |
| 잡코리아 | `https://www.jobkorea.co.kr/robots.txt` | robots | 2026-08-05 | 봇별 허용/차단, 검색쿼리 제한, sitemap | Officially documented | 높음 | 예 |
| 잡코리아 | `https://company.jobkorea.co.kr/Network/Popup_Xml_sample_1.asp` | API 샘플 | 2026-08-05 | XML 채용 목록 필드 예시 | Officially documented | 높음 | 예 |
| 잡코리아/알바몬 | `https://www.worxphere.ai/partnership` | 제휴 | 2026-08-05 | 공식 제휴 문의 창구 | Officially documented | 높음 | 예 |
| 알바몬 | `https://www.albamon.com/jobs/area` | 검색 | 2026-08-05 | 서울·경기 선택, 구·동, 급여/시간 카드, 광고/일반 영역, 번호 페이지 | Observed | 높음 | 아니오 |
| 알바몬 | `POST https://bff-general.albamon.com/recruit/search` | 내부 BFF | 2026-08-05 | JSON 조건형 검색 요청 | Observed | 중간 | 아니오; Observed internal endpoint |
| 알바몬 | `GET https://api-code.albamon.com/codes/areas/korean/sigu/codes` | 코드 | 2026-08-05 | 지역 코드 XHR | Observed | 중간 | 아니오; Observed internal endpoint |
| 알바몬 | `https://www.albamon.com/jobs/detail/118270285` | 상세 | 2026-08-05 | canonical, JobPosting JSON-LD, 일급, 도로명주소, 좌표, 본사/근무지 분리 | Observed | 높음 | 아니오 |
| 알바몬 | `https://www.albamon.com/robots.txt` | robots | 2026-08-05 | `/jobs` 허용과 상세 하위경로 제한, sitemap | Officially documented | 높음 | 예 |
| 알바몬 | `https://www.albamon.com/service-center/terms/member` | 약관 | 2026-08-05 | 사이트 범위, 복제/영리 이용 제한, 제휴 XML/API 언급 | Officially documented | 높음 | 예 |
| 고용24 | `https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchList.do` | 검색 | 2026-08-05 | 공개 상세검색 폼, 비로그인 | Observed | 높음 | 아니오 |
| 고용24 | `...?region=11260&webIsOut=region` | 지역결과 | 2026-08-05 | 총 754, 10개 표본, 급여/지역/등록/마감/정보제공처 | Observed | 높음 | 아니오 |
| 고용24 | `.../empDetailAuthView.do?...wantedAuthNo=KEC0222607070001` | 상세 | 2026-08-05 | 월급범위, 정확주소, 역, 등록일시, 변경예정 위치 | Observed | 높음 | 아니오 |
| 고용24 | `/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do` | API | 2026-08-05 | XML 목록/상세, 필터, 페이지, 출력 필드 | Officially documented | 높음 | 예 |
| 고용24 | `https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do` | API 절차 | 2026-08-05 | 기업회원·신청·심사·인증키 | Officially documented | 높음 | 예 |
| 고용24 | `https://www.data.go.kr/data/3038225/openapi.do?recommendDataYn=Y` | 공공데이터 | 2026-08-05 | 무료·실시간·XML·제4유형/제3자권리 | Officially documented | 높음 | 예 |
| 고용24 | `https://www.work24.go.kr/robots.txt` | robots | 2026-08-05 | 기본 허용, 일부 경로 제한, sitemap | Officially documented | 높음 | 예 |

Sitemap은 세 사이트 robots에서 확인했다. RSS는 발견하지 못했다. 사이트맵의 전체 범위·갱신 빈도는 조사하지 않았다.

## 18. 조사 한계

이번 조사는 한 시점의 매우 작은 공개 표본이다. 전체 서울·경기 데이터, 모든 급여 유형, 실제 최대 페이지, 장기 갱신/삭제를 조사하지 않았다. 잡코리아·알바몬 내부 엔드포인트는 관찰 사실만 기록했으며 사용 권한이나 안정성을 뜻하지 않는다. 고용24 API는 문서만 확인했고 인증키를 발급받거나 실제 호출하지 않았다.

브라우저의 기존 로그인 상태가 감지된 뒤 계정 관련 요청은 즉시 범위에서 제외했고, 보고서·파일에는 계정, 쿠키, 토큰, 세션, 담당자 연락처, 개인 식별 정보를 저장하지 않았다. 고용24 페이지의 브라우저 검사 도구 충돌은 봇 차단 근거로 사용하지 않았다. CAPTCHA나 접근 제한을 우회하지 않았다.

이 보고서는 기술·제품 발견 문서이지 법률 의견이 아니다. robots 허용은 계약·저작권·데이터베이스권·개인정보·재배포 허가를 대신하지 않는다. 생산 연동 전 각 운영사의 서면 허가와 법무 검토가 필요하다.
