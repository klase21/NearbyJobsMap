[CmdletBinding()]
param([int]$Port = 3000, [switch]$RequireCollectionReady)
. (Join-Path $PSScriptRoot "windows-common.ps1")
. (Join-Path $PSScriptRoot "playwright-browser.ps1")
Enter-ProjectRoot
$failures = 0
function Check([string]$Label, [scriptblock]$Action, [switch]$WarningOnly) {
  try { & $Action; Write-Pass $Label } catch {
    $message = Protect-LocalText $_.Exception.Message
    if ($WarningOnly) { Write-Warn "$Label - $message" } else { Write-Fail "$Label - $message"; $script:failures++ }
  }
}
function BrowserCheck([string]$Label, [scriptblock]$Action) { Check $Label $Action -WarningOnly:(-not $RequireCollectionReady) }

Check "Node.js 20.9 or newer" { Assert-NodeVersion | Out-Null }
Check "npm available" { Assert-Command "npm.cmd" "Install Node.js."; & npm.cmd --version | Out-Null }
Check "dependencies installed" { if (-not (Test-Path node_modules)) { throw "node_modules is missing. Run install.ps1." } }
Check "environment example" { if (-not (Test-Path .env.example)) { throw ".env.example is missing." } }
Check "local environment file" { if (-not (Test-Path .env.local)) { throw ".env.local is missing; install.ps1 creates it." } } -WarningOnly
foreach ($directory in @("data", "data\backups", "artifacts", "artifacts\runtime", "artifacts\support")) {
  Check "$directory writable" { New-Item $directory -ItemType Directory -Force | Out-Null; $probe=Join-Path $directory ".doctor-$PID.tmp"; Set-Content -LiteralPath $probe "ok"; Remove-Item -LiteralPath $probe -Force }
}
Check "SQLite and migrations" { if (Test-Path -LiteralPath (Get-DatabasePath)) { Invoke-Npm @("run","db:status") } else { throw "Database is missing. Run db:init." } }
Check "port $Port" { if (-not (Test-PortAvailable "127.0.0.1" $Port) -and $null -eq (Remove-StaleState)) { throw "Port is used by another process." } } -WarningOnly
$stateBefore = Get-ProcessState
if ($null -ne $stateBefore -and -not (Test-OwnedProcess $stateBefore)) { Check "PID state" { throw "Stale PID state; status.ps1 can safely clean it." } -WarningOnly }
else { Write-Pass "PID state" }
$browserStatus = Get-PlaywrightChromiumStatus
BrowserCheck "Playwright package" { if (-not $browserStatus.PackageInstalled) { throw "Playwright package is missing." } }
BrowserCheck "Chromium executable" { if (-not $browserStatus.ExecutableExists) { throw "Run .\scripts\install-browser.ps1." } }
BrowserCheck "Chromium blank-page launch and cleanup" { if (-not (Test-PlaywrightChromiumLaunch)) { throw "Could not launch Chromium, create about:blank, and close it." } }
Check "production build" { if (-not (Test-Path ".next\BUILD_ID")) { throw "Run npm run build." } } -WarningOnly
Check "Git worktree" { if (git status --porcelain) { throw "Uncommitted changes exist." } } -WarningOnly
Check "bounded release audit" { Invoke-Npm @("run","release:audit") } -WarningOnly
$package = Get-Content package.json -Raw | ConvertFrom-Json
$collectionEnabled = $env:NEARBY_JOBS_ENABLE_COLLECTION_UI -eq "1"
Write-Host "INFO  version=$($package.version) repository=https://github.com/klase21/NearbyJobsMap"
Write-Host "INFO  collection_ui=$(if($collectionEnabled){'enabled'}else{'disabled'}) binding=loopback-required"
if ($failures -gt 0) { Write-Fail "$failures blocking problem(s)"; exit 1 }
Write-Pass "Doctor completed; warnings cover optional features or cleanup advice."
