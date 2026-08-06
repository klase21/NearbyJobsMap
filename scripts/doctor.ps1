[CmdletBinding()]param([int]$Port = 3000)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
$failures = 0
function Check([string]$Label, [scriptblock]$Action, [switch]$WarningOnly) {
  try { & $Action; Write-Pass $Label } catch { if ($WarningOnly) { Write-Warn "$Label — $($_.Exception.Message)" } else { Write-Fail "$Label — $($_.Exception.Message)"; $script:failures++ } }
}
Check "Node.js 20.9 이상" { Assert-NodeVersion | Out-Null }
Check "npm 사용 가능" { Assert-Command "npm.cmd" "Node.js를 설치하세요."; & npm.cmd --version | Out-Null }
Check "의존성 설치" { if (-not (Test-Path node_modules)) { throw "node_modules가 없습니다. install.ps1을 실행하세요." } }
Check "환경 예제" { if (-not (Test-Path .env.example)) { throw ".env.example이 없습니다." } }
Check "로컬 환경 파일" { if (-not (Test-Path .env.local)) { throw ".env.local이 없습니다. install.ps1이 생성합니다." } } -WarningOnly
Check "데이터 디렉터리 쓰기" { New-Item data -ItemType Directory -Force | Out-Null; $probe="data\.doctor-$PID.tmp"; Set-Content $probe "ok"; Remove-Item $probe -Force }
Check "SQLite 및 migration" { if (Test-Path -LiteralPath (Get-DatabasePath)) { Invoke-Npm @("run","db:status") } else { throw "database가 없습니다. db:init을 실행하세요." } }
Check "포트 $Port 상태" { if (-not (Test-PortAvailable "127.0.0.1" $Port) -and $null -eq (Remove-StaleState)) { throw "다른 프로세스가 사용 중입니다." } } -WarningOnly
Check "Playwright Chromium" { & node -e "const fs=require('fs');const p=require('playwright').chromium.executablePath();if(!fs.existsSync(p))process.exit(1)"; if ($LASTEXITCODE -ne 0) { throw "npx playwright install chromium을 실행하세요." } } -WarningOnly
Check "production build" { if (-not (Test-Path ".next\BUILD_ID")) { throw "npm run build가 필요합니다." } } -WarningOnly
Check "백업 디렉터리 쓰기" { New-Item data\backups -ItemType Directory -Force | Out-Null; $probe="data\backups\.doctor-$PID.tmp"; Set-Content $probe "ok"; Remove-Item $probe -Force }
Check "Git 작업 트리" { if (git status --porcelain) { throw "커밋되지 않은 변경이 있습니다." } } -WarningOnly
Check "bounded release audit" { Invoke-Npm @("run","release:audit") } -WarningOnly
if ($failures -gt 0) { Write-Fail "차단 문제 $failures개"; exit 1 }
Write-Pass "doctor 완료 (경고는 선택 기능 또는 정리 권고입니다)."
