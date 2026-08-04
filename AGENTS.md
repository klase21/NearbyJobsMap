# Project Identity

이 프로젝트는 로컬 우선 통합 채용 목록과 보조적 근무지 지도를 위한 데이터 계약 기반이다. 현재 단계는 잡코리아·알바몬의 작은 sanitized fixture와 parser만 다룬다.

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
```

fixture 변경은 명시 필드 assertion과 민감정보 검사도 통과해야 한다. 실패를 광범위한 lint 비활성화나 타입 회피로 숨기지 않는다.

## Documentation Rule

허용되는 Markdown 파일은 다음뿐이다.

- `README.md`
- `AGENTS.md`
- `RESEARCH.md`
- `reports/FIXTURE_VALIDATION.md`
- 추후 명시적으로 요청된 필수 GitHub template
