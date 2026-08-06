[CmdletBinding()]
param([switch]$SkipBackup,[switch]$SkipValidation,[switch]$BuildProduction,[switch]$SkipBrowserInstall)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  if ($null -ne (Remove-StaleState)) { throw "앱이 실행 중입니다. stop.ps1로 안전하게 중지한 뒤 다시 실행하세요." }
  Assert-NodeVersion | Out-Null
  if (-not $SkipBackup -and (Test-Path -LiteralPath (Get-DatabasePath))) { Write-Step "업데이트 전 백업을 생성합니다."; Invoke-Npm @("run","backup:create") }
  Write-Step "사용자가 준비한 소스에 맞춰 의존성을 갱신합니다. git pull은 실행하지 않습니다."
  Invoke-Npm @("ci")
  if (-not $SkipBrowserInstall) { & npx.cmd playwright install chromium; if ($LASTEXITCODE -ne 0) { throw "Chromium 갱신 실패" } }
  Invoke-Npm @("run","db:migrate")
  if (-not $SkipValidation) { Invoke-Npm @("run","typecheck") }
  if ($BuildProduction) { Invoke-Npm @("run","build") }
  Write-Pass "업데이트 준비가 완료되었습니다. .\scripts\start.ps1로 다시 시작하세요."
} catch { Write-Fail $_.Exception.Message; exit 1 }
