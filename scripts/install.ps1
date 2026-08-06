[CmdletBinding()]
param(
  [switch]$SkipBrowserInstall,
  [switch]$SkipValidation,
  [switch]$FreshDatabase,
  [switch]$SeedDemoData,
  [ValidateRange(1, 30)][int]$BrowserInstallTimeoutMinutes = 10,
  [switch]$RequireBrowserInstall,
  [string]$ResetConfirmation = ""
)
. (Join-Path $PSScriptRoot "windows-common.ps1")
. (Join-Path $PSScriptRoot "playwright-browser.ps1")
Enter-ProjectRoot
try {
  $node = Assert-NodeVersion
  Write-Pass "Node.js $node"
  Write-Step "npm 의존성을 설치합니다."
  if (Test-Path package-lock.json) { Invoke-Npm @("ci") } else { Invoke-Npm @("install") }
  if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local; Write-Step ".env.local을 안전한 기본값으로 만들었습니다." }
  foreach ($directory in @("data", "data\backups", "data\exports", "data\imports", "data\tmp", "artifacts\runtime")) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
  Import-LocalEnvironment
  $db = Get-DatabasePath
  if ($FreshDatabase -and (Test-Path -LiteralPath $db)) {
    if ($ResetConfirmation -ne "RESET LOCAL DATABASE") { throw '-FreshDatabase에는 -ResetConfirmation "RESET LOCAL DATABASE"가 필요합니다.' }
    Invoke-Npm @("run", "db:reset", "--", "--confirm", "--migrate")
  } else { Invoke-Npm @("run", "db:migrate") }
  if ($SeedDemoData) { Invoke-Npm @("run", "setup:local") }
  $browserReady = $false
  if ($SkipBrowserInstall) {
    Write-Warn "Chromium 설치를 건너뛰었습니다. 공고 목록과 로컬 작업 공간은 사용할 수 있지만 브라우저 수집 기능은 준비되지 않을 수 있습니다."
  } else {
    $browserResult = Invoke-PlaywrightChromiumInstall -TimeoutMinutes $BrowserInstallTimeoutMinutes
    $browserReady = $browserResult.Succeeded -and (Test-PlaywrightChromiumLaunch)
    if (-not $browserReady) {
      $recovery = ".\scripts\install-browser.ps1 -TimeoutMinutes $BrowserInstallTimeoutMinutes"
      if ($RequireBrowserInstall) { throw "Chromium 설치 또는 실행 확인에 실패했습니다. 복구 명령: $recovery" }
      Write-Warn "Chromium 설치가 완료되지 않았습니다. 비수집 기능 설치는 계속됩니다. 복구 명령: $recovery"
    }
  }
  Invoke-Npm @("run", "db:status")
  if (-not $SkipValidation) { Invoke-Npm @("run", "typecheck") }
  if ($browserReady) { Write-Pass "Chromium 수집 준비를 확인했습니다." }
  Write-Pass "설치가 완료되었습니다. 다음 명령: .\scripts\start.ps1"
} catch { Write-Fail $_.Exception.Message; exit 1 }
