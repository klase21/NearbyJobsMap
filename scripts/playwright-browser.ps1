Set-StrictMode -Version Latest

function Get-PlaywrightChromiumStatus {
  $result = [ordered]@{ PackageInstalled = $false; ExecutablePath = $null; ExecutableExists = $false }
  if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot "node_modules\playwright\package.json"))) { return [pscustomobject]$result }
  $result.PackageInstalled = $true
  $encoded = & node -e "const {chromium}=require('playwright');process.stdout.write(JSON.stringify({path:chromium.executablePath()}))"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($encoded)) { return [pscustomobject]$result }
  try {
    $path = ($encoded | ConvertFrom-Json).path
    $result.ExecutablePath = $path
    $result.ExecutableExists = -not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path)
  } catch { }
  return [pscustomobject]$result
}

function Test-PlaywrightChromiumLaunch {
  $status = Get-PlaywrightChromiumStatus
  if (-not $status.ExecutableExists) { return $false }
  & node -e "const {chromium}=require('playwright');(async()=>{let b;try{b=await chromium.launch({headless:true});const p=await b.newPage();if(p.url()!=='about:blank')process.exitCode=2;await p.close()}catch(e){process.exitCode=1}finally{if(b)await b.close()}})()"
  return $LASTEXITCODE -eq 0
}

function Stop-StartedProcessTree([int]$ProcessId) {
  if ($ProcessId -le 0 -or -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Invoke-PlaywrightChromiumInstall {
  param([ValidateRange(1, 30)][int]$TimeoutMinutes = 10, [switch]$Force)
  Assert-Command "npx.cmd" "Install npm dependencies first."
  New-Item -ItemType Directory -Path $script:RuntimeDirectory -Force | Out-Null
  $stdout = Join-Path $script:RuntimeDirectory "browser-install-$PID.out.log"
  $stderr = Join-Path $script:RuntimeDirectory "browser-install-$PID.err.log"
  $arguments = @("playwright", "install", "chromium")
  if ($Force) { $arguments += "--force" }
  Write-Step "Starting Playwright Chromium installation."
  Write-Step "Command: npx.cmd playwright install chromium (timeout: $TimeoutMinutes minutes)"
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $process = $null
  try {
    Normalize-ProcessEnvironment
    $process = Start-Process -FilePath "npx.cmd" -ArgumentList $arguments -WorkingDirectory $script:ProjectRoot -NoNewWindow -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $process.WaitForExit($TimeoutMinutes * 60 * 1000)) {
      Stop-StartedProcessTree $process.Id
      Write-Warn "Chromium install exceeded $TimeoutMinutes minutes; only its process tree was stopped."
      return [pscustomobject]@{ Succeeded = $false; TimedOut = $true; ExitCode = $null; ElapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds) }
    }
    $process.WaitForExit()
    foreach ($file in @($stdout, $stderr)) {
      if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file | Select-Object -Last 80 | ForEach-Object { Write-Host (Protect-LocalText ([string]$_)) } }
    }
    if ($process.ExitCode -ne 0) {
      Write-Warn "Chromium install failed with exit code $($process.ExitCode) after $([math]::Round($watch.Elapsed.TotalSeconds)) seconds."
      return [pscustomobject]@{ Succeeded = $false; TimedOut = $false; ExitCode = $process.ExitCode; ElapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds) }
    }
    Write-Pass "Chromium install completed in $([math]::Round($watch.Elapsed.TotalSeconds)) seconds."
    return [pscustomobject]@{ Succeeded = $true; TimedOut = $false; ExitCode = 0; ElapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds) }
  } finally {
    $watch.Stop()
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}
