# GitHub v0.1.0 릴리스 검토 체크리스트

아래 명령과 GitHub 작업은 소유자가 최종 검토 후 수동으로 실행합니다. 이 문서를 추가하는 작업에서는 실행하지 말고 체크리스트로만 사용합니다.

1. `npm.cmd run release:check`를 실행한다.
2. README, 여섯 스크린샷, release notes, MIT license, 소스 제한 사항을 직접 검토한다.
3. 사용할 수 있다면 외부 secret scanner를 별도로 실행한다.
4. GitHub에서 빈 repository를 만든다.
5. 필요하면 로컬 기본 branch를 `main`으로 바꾼다.
6. 새 remote를 추가한다.
7. `main`을 push한다.
8. GitHub Actions CI 완료를 기다리고 결과를 검토한다.
9. branch protection과 repository security 설정을 검토한다.
10. Private vulnerability reporting을 활성화한다.
11. 최종 commit에 `v0.1.0` tag를 만든다.
12. 제목 `NearbyJobsMap v0.1.0 — Local MVP`로 GitHub release 초안을 만든다.
13. `docs/RELEASE_NOTES_0.1.0.md` 내용을 붙여 넣고 다시 검토한다.
14. Windows source ZIP, `.sha256`, `.manifest.json`을 첨부한다.
15. CI·파일·문서 검토가 모두 끝난 후 normal release로 게시한다.

## Rollback

- secret 발견: push 또는 release를 중단하고 현재 tree에서 제거한다. 이미 push했다면 노출된 credential을 즉시 폐기하고 Git history 정리 범위를 검토한다.
- 잘못된 스크린샷: release를 게시하지 않고 격리 캡처를 다시 실행한 뒤 이미지를 재검토한다.
- 손상된 package: ZIP과 checksum을 삭제하고 `npm.cmd run package:release`로 다시 만든다.
- CI 실패: release와 tag 생성을 중단하고 실패 원인을 수정한 새 commit에서 전체 검증을 반복한다.
