[CmdletBinding()]
param(
  [ValidateRange(1,65535)][int]$Port = 3000,
  [string]$HostAddress = "127.0.0.1",
  [switch]$EnableCollectionUI,
  [switch]$Production,
  [switch]$OpenBrowser,
  [switch]$NoOpenBrowser
)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  Assert-NodeVersion | Out-Null
  $existing = Remove-StaleState
  if ($null -ne $existing) { throw "이미 실행 중입니다. PID=$($existing.pid), URL=$($existing.url)" }
  if ($EnableCollectionUI -and -not (Test-Loopback $HostAddress)) { throw "비로컬 주소에서는 수집 UI를 활성화할 수 없습니다." }
  if (-not (Test-PortAvailable $HostAddress $Port)) { throw "포트 $Port를 사용할 수 없습니다. 다른 프로세스를 종료하거나 -Port를 변경하세요." }
  if ($Production -and -not (Test-Path ".next\BUILD_ID")) { throw "production build가 없습니다. npm.cmd run build를 먼저 실행하세요." }
  New-Item -ItemType Directory -Path $script:RuntimeDirectory -Force | Out-Null
  $env:HOSTNAME = $HostAddress; $env:PORT = "$Port"; $env:NEARBY_JOBS_ENABLE_COLLECTION_UI = if ($EnableCollectionUI) { "1" } else { "0" }
  $mode = if ($Production) { "production" } else { "development" }
  $npmArgs = if ($Production) { @("run","start","--","-H",$HostAddress,"-p","$Port") } else { @("run","dev","--","--hostname",$HostAddress,"--port","$Port") }
  $stdout = Join-Path $script:RuntimeDirectory "server.out.log"; $stderr = Join-Path $script:RuntimeDirectory "server.err.log"
  Normalize-ProcessEnvironment
  $process = Start-Process -FilePath "npm.cmd" -ArgumentList $npmArgs -WorkingDirectory $script:ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $state = [ordered]@{ pid=$process.Id; startedAt=$process.StartTime.ToUniversalTime().ToString("o"); root=$script:ProjectRoot; url="http://${HostAddress}:$Port"; host=$HostAddress; port=$Port; mode=$mode; collectionUI=[bool]$EnableCollectionUI }
  $state | ConvertTo-Json | Set-Content -LiteralPath $script:StateFile -Encoding UTF8
  $ready = $false
  for ($i=0; $i -lt 60; $i++) { if ($process.HasExited) { break }; try { $response=Invoke-WebRequest -Uri $state.url -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { $ready=$true; break } } catch {}; Start-Sleep -Milliseconds 500 }
  if (-not $ready) { Stop-OwnedProcessTree $state; Remove-Item $script:StateFile -Force -ErrorAction SilentlyContinue; throw "서버가 30초 안에 준비되지 않았습니다. artifacts/runtime 로그를 확인하세요." }
  $serverPid = Get-ListeningProcessId $Port
  if (-not $serverPid) { Stop-OwnedProcessTree $state; Remove-Item $script:StateFile -Force -ErrorAction SilentlyContinue; throw "준비된 서버의 listener PID를 확인할 수 없습니다." }
  $serverProcess = Get-Process -Id $serverPid -ErrorAction Stop
  $state.serverPid = $serverPid; $state.serverStartedAt = $serverProcess.StartTime.ToUniversalTime().ToString("o")
  $state | ConvertTo-Json | Set-Content -LiteralPath $script:StateFile -Encoding UTF8
  Write-Pass "실행 중: $($state.url) (수집 UI: $(if($EnableCollectionUI){'활성'}else{'비활성'}))"
  Write-Host "중지: .\scripts\stop.ps1"
  if ($OpenBrowser -and -not $NoOpenBrowser) { Start-Process $state.url }
} catch { Write-Fail $_.Exception.Message; exit 1 }
