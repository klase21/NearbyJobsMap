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
