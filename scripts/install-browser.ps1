[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateRange(1, 30)][int]$TimeoutMinutes = 10,
  [switch]$Force,
  [switch]$WithDependencies,
  [switch]$CheckOnly
)
. (Join-Path $PSScriptRoot "windows-common.ps1")
. (Join-Path $PSScriptRoot "playwright-browser.ps1")
Enter-ProjectRoot
try {
  Assert-NodeVersion | Out-Null
  if ($WithDependencies) { throw "Windows does not run the privileged --with-deps flow. Install Chromium only." }
  $status = Get-PlaywrightChromiumStatus
  if (-not $status.PackageInstalled) { throw "Playwright is missing. Run .\scripts\install.ps1 -SkipBrowserInstall first." }
  if ($CheckOnly) {
    if (-not $status.ExecutableExists -or -not (Test-PlaywrightChromiumLaunch)) { throw "Chromium is missing or cannot launch." }
    Write-Pass "Chromium installation and blank-page launch verified."
    exit 0
  }
  if ($WhatIfPreference) { Write-Step "Would run: npx.cmd playwright install chromium (timeout: $TimeoutMinutes minutes)"; exit 0 }
  if (-not $PSCmdlet.ShouldProcess("project Playwright cache", "Install Chromium")) { exit 0 }
  $result = Invoke-PlaywrightChromiumInstall -TimeoutMinutes $TimeoutMinutes -Force:$Force
  if (-not $result.Succeeded -or -not (Test-PlaywrightChromiumLaunch)) { throw "Chromium verification failed after installation." }
  Write-Pass "Browser collection prerequisites are ready."
} catch { Write-Fail $_.Exception.Message; exit 1 }
