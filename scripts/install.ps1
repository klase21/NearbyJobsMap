[CmdletBinding()]
param(
  [switch]$SkipBrowserInstall,
  [switch]$SkipValidation,
  [switch]$FreshDatabase,
  [switch]$SeedDemoData,
  [string]$ResetConfirmation = ""
)
. (Join-Path $PSScriptRoot "windows-common.ps1")
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
  if (-not $SkipBrowserInstall) { Write-Step "Playwright Chromium을 설치합니다."; & npx.cmd playwright install chromium; if ($LASTEXITCODE -ne 0) { throw "Chromium 설치 실패" } }
  Invoke-Npm @("run", "db:status")
  if (-not $SkipValidation) { Invoke-Npm @("run", "typecheck") }
  Write-Pass "설치가 완료되었습니다. 다음 명령: .\scripts\start.ps1"
} catch { Write-Fail $_.Exception.Message; exit 1 }
