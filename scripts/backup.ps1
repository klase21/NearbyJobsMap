[CmdletBinding()]
param([switch]$List,[switch]$Verify,[string]$File,[string]$OutputName)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  if ($List) { Invoke-Npm @("run","backup:list"); exit 0 }
  if ($Verify) { if ([string]::IsNullOrWhiteSpace($File)) { throw "-Verify에는 -File이 필요합니다." }; Invoke-Npm @("run","backup:verify","--","--file",$File); exit 0 }
  $args=@("run","backup:create");if($OutputName){$args+=@("--","--name",$OutputName)};Invoke-Npm $args
} catch { Write-Fail $_.Exception.Message; exit 1 }
