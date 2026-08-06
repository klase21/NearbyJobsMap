Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:RuntimeDirectory = Join-Path $script:ProjectRoot "artifacts\runtime"
$script:StateFile = Join-Path $script:RuntimeDirectory "nearby-jobs-process.json"

function Write-Step([string]$Message) { Write-Host "[NearbyJobsMap] $Message" -ForegroundColor Cyan }
function Write-Pass([string]$Message) { Write-Host "PASS  $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "WARN  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "FAIL  $Message" -ForegroundColor Red }

function Enter-ProjectRoot { Set-Location -LiteralPath $script:ProjectRoot }

function Normalize-ProcessEnvironment {
  # Some host shells expose both Path and PATH. Windows PowerShell 5.1
  # Start-Process rejects that case-insensitive duplicate dictionary.
  $keys = @([Environment]::GetEnvironmentVariables("Process").Keys)
  if ($keys -ccontains "Path" -and $keys -ccontains "PATH") {
    [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  }
}

function Import-LocalEnvironment {
  $file = Join-Path $script:ProjectRoot ".env.local"
  if (-not (Test-Path -LiteralPath $file)) { return }
  foreach ($line in Get-Content -LiteralPath $file) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim().Trim('"').Trim("'")
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
  }
}

function Assert-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name 명령을 찾을 수 없습니다. $Help" }
}

function Assert-NodeVersion {
  Assert-Command "node" "Node.js 20.9 이상을 설치하세요."
  Assert-Command "npm.cmd" "npm이 포함된 Node.js를 설치하세요."
  $raw = (& node --version).Trim().TrimStart('v')
  $version = [version]$raw
  if ($version -lt [version]"20.9.0") { throw "Node.js 20.9 이상이 필요합니다. 현재: $raw" }
  return $raw
}

function Invoke-Npm([string[]]$Arguments) {
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "npm.cmd $($Arguments -join ' ') 실패 (exit $LASTEXITCODE)" }
}

function Get-DatabasePath {
  Import-LocalEnvironment
  $configured = $env:NEARBY_JOBS_DB_PATH
  if ([string]::IsNullOrWhiteSpace($configured)) { $configured = ".\data\nearby-jobs.sqlite" }
  if ([IO.Path]::IsPathRooted($configured)) { return [IO.Path]::GetFullPath($configured) }
  return [IO.Path]::GetFullPath((Join-Path $script:ProjectRoot $configured))
}

function Get-ProcessState {
  if (-not (Test-Path -LiteralPath $script:StateFile)) { return $null }
  try { return Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json } catch { Remove-Item -LiteralPath $script:StateFile -Force; return $null }
}

function Test-RecordedProcess([int]$ProcessId, [string]$StartedAt) {
  if ($ProcessId -le 0 -or [string]::IsNullOrWhiteSpace($StartedAt)) { return $false }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $false }
  try {
    $expected = [datetime]::Parse($StartedAt).ToUniversalTime()
    $actual = $process.StartTime.ToUniversalTime()
    return [Math]::Abs(($actual - $expected).TotalSeconds) -lt 3
  } catch { return $false }
}

function Test-OwnedProcess($State) {
  if ($null -eq $State) { return $false }
  if ($State.PSObject.Properties.Name -contains "serverPid" -and $State.serverPid) {
    return Test-RecordedProcess ([int]$State.serverPid) ([string]$State.serverStartedAt)
  }
  return Test-RecordedProcess ([int]$State.pid) ([string]$State.startedAt)
}

function Remove-StaleState {
  $state = Get-ProcessState
  if ($null -ne $state -and -not (Test-OwnedProcess $state)) { Remove-Item -LiteralPath $script:StateFile -Force -ErrorAction SilentlyContinue; return $null }
  return $state
}

function Test-Loopback([string]$Address) { return $Address -in @("127.0.0.1", "localhost", "::1") }

function Test-PortAvailable([string]$Address, [int]$Port) {
  $listener = $null
  try {
    $ip = if ($Address -eq "localhost") { [Net.IPAddress]::Loopback } else { [Net.IPAddress]::Parse($Address) }
    $listener = [Net.Sockets.TcpListener]::new($ip, $Port)
    $listener.Start()
    return $true
  } catch { return $false } finally { if ($null -ne $listener) { $listener.Stop() } }
}

function Get-ListeningProcessId([int]$Port) {
  foreach ($line in & netstat.exe -ano -p tcp) {
    if ($line -match '^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
      $endpoint = $Matches[1]; $listenerPid = [int]$Matches[2]
      if ($endpoint -match ":$Port$") { return $listenerPid }
    }
  }
  return $null
}

function Stop-OwnedProcessTree($State) {
  if (-not (Test-OwnedProcess $State)) { return }
  if ($State.PSObject.Properties.Name -contains "serverPid" -and (Test-RecordedProcess ([int]$State.serverPid) ([string]$State.serverStartedAt))) {
    Stop-Process -Id ([int]$State.serverPid) -Force -ErrorAction SilentlyContinue
  }
  if ($State.pid -and (Test-RecordedProcess ([int]$State.pid) ([string]$State.startedAt))) {
    Stop-Process -Id ([int]$State.pid) -Force -ErrorAction SilentlyContinue
  }
}
