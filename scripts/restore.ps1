[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$Confirm)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  if ($Confirm -ne "RESTORE DATABASE") { throw '정확한 -Confirm "RESTORE DATABASE"가 필요합니다.' }
  if ($null -ne (Remove-StaleState)) { throw "앱이 실행 중입니다. stop.ps1로 먼저 중지하세요." }
  Write-Step "복원 전 백업을 검증합니다."
  Invoke-Npm @("run","backup:verify","--","--file",$File)
  $answer=Read-Host "현재 DB와 백업의 차이를 확인했습니다. 복원을 계속하려면 RESTORE를 입력하세요"
  if ($answer -ne "RESTORE") { throw "사용자가 복원을 취소했습니다." }
  Invoke-Npm @("run","backup:restore","--","--file",$File,"--confirm","RESTORE DATABASE")
  Write-Pass "복원이 완료되었습니다. db:status를 확인한 뒤 앱을 다시 시작하세요."
} catch { Write-Fail $_.Exception.Message; exit 1 }
