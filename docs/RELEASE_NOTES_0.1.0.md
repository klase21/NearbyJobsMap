# NearbyJobsMap v0.1.0 — Local MVP

이 문서는 아직 게시되지 않은 로컬 릴리스 후보의 안내입니다.

## Highlights

- 로컬 우선 통합 공고 목록과 보조 지도
- 제한된 수동 JobKorea 수집과 목록 정보 fallback
- 소스별 내장 프리셋, 서울·경기 로컬 정규화, 제외 키워드
- 수집 현황, 진행 상태, 최근 write 이력과 읽기 전용 분석
- 저장 프로필, 비교, revision, 충돌 안전 import/export
- 관심·지원 상태·메모·날짜를 포함한 개인 구직 워크스페이스
- 최신성, 관찰·변경 이력, 고급 필터와 저장 보기
- 검증 가능한 로컬 SQLite backup/restore와 Windows 실행 스크립트

## Safety and privacy

- 데이터는 로컬 SQLite에 저장되며 cloud 계정이나 telemetry가 없습니다.
- 수집 UI는 기본 비활성화이고 localhost와 명시적 flag가 모두 필요합니다.
- 로그인·CAPTCHA·접근 제어 우회, scheduler, 자동 retry가 없습니다.
- runtime database, backup, profile export, 개인 메모는 Git에 포함하지 않습니다.

## Known limitations

- JobKorea 익명 상세 페이지가 login 또는 verification 내용을 반환할 수 있어 수집 결과가 목록 정보로 남을 수 있습니다.
- Albamon live listing transport는 실행 환경에 따라 실패할 수 있습니다.
- 수집 공고 상당수는 좌표가 없어 지도에는 표시되지 않습니다.
- 제3자 소스 수집 permission은 확인되지 않았으며 이 프로젝트가 permission을 부여하지 않습니다.
- Work24는 통합되지 않았습니다.
- 자동 scheduling이 없습니다.
- Windows source ZIP은 native standalone executable이 아닙니다.
- 이전 clean-copy 검증에서는 Chromium download를 생략했으므로 새 PC에서는 install script의 browser 설치 단계를 확인해야 합니다.

## Installation

```powershell
.\scripts\install.ps1
.\scripts\start.ps1
```

브라우저에서 <http://127.0.0.1:3000>을 엽니다. 수집 기능은 필요한 경우에만 `-EnableCollectionUI`로 켭니다.

## Verification

- 이 sprint 시작 전 515개 테스트가 통과했습니다. 최종 검증 수는 release candidate 검토 시 함께 기록합니다.
- Windows clean-copy 설치는 browser 설치를 건너뛴 형태로 검증되었습니다.
- 현재 설치의 Chromium 가용성은 `scripts/doctor.ps1`에서 확인되었습니다.
