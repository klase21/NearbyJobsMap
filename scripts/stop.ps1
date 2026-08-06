[CmdletBinding()]param()
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  $state = Get-ProcessState
  if ($null -eq $state) { Write-Pass "이미 중지되어 있습니다."; exit 0 }
  if (-not (Test-OwnedProcess $state)) { Remove-Item $script:StateFile -Force -ErrorAction SilentlyContinue; Write-Warn "오래된 PID 파일을 제거했습니다. 다른 프로세스는 종료하지 않았습니다."; exit 0 }
  Stop-OwnedProcessTree $state
  Remove-Item $script:StateFile -Force -ErrorAction SilentlyContinue
  Write-Pass "NearbyJobsMap PID $($state.pid)를 중지했습니다."
} catch { Write-Fail $_.Exception.Message; exit 1 }
