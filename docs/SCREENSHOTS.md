# 문서 스크린샷

공개 문서 이미지는 실제 운영 데이터가 아니라 고정된 가상 데이터로만 생성합니다.

```powershell
npm.cmd run docs:screenshots
npm.cmd run docs:screenshots:audit
```

캡처 명령은 `artifacts/screenshot-work/`에 임시 SQLite 데이터베이스를 만들고 migration 0001–0010을 적용합니다. 24개의 가상 공고, 세 개의 합성 프로필, 합성 write 이력을 시드한 다음 loopback Next.js 서버와 Playwright Chromium을 사용합니다. JobKorea, Albamon, OpenStreetMap을 포함한 모든 비로컬 요청은 브라우저 경계에서 차단되며 수집 서비스는 호출되지 않습니다. 완료 또는 실패 시 임시 DB와 작업 폴더를 삭제하고, 성공했을 때만 승인된 PNG를 `docs/images/`로 복사합니다.

승인 파일:

- `jobs-list-map-desktop.png` — 1440×1000
- `collection-dashboard-desktop.png` — 1440×1100
- `collection-execution-desktop.png` — 1440×1100
- `profile-comparison-desktop.png` — 1440×1100
- `job-workspace-mobile.png` — 390×844
- `onboarding-mobile.png` — 390×844

공개 전에는 각 이미지를 직접 열어 다음을 확인합니다.

- 회사명·공고명·메모·posting ID가 모두 가상 값인지
- 사용자 이름, 로컬 경로, 환경 값, credential이 없는지
- 한국어 글자가 잘리지 않고 수집 관리 내비게이션이 중앙 정렬되는지
- 외부 지도 타일, debug overlay, console 오류, 수평 overflow가 없는지
- 이미지가 부분 렌더링되거나 손상되지 않았는지

실사용 `data/nearby-jobs.sqlite`를 캡처 입력으로 사용하는 것은 금지됩니다.
