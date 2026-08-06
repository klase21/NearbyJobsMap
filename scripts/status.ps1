[CmdletBinding()]param()
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  $node = Assert-NodeVersion
  $state = Remove-StaleState
  if ($null -eq $state) { Write-Host "application=stopped" } else { Write-Host "application=running pid=$($state.pid) url=$($state.url) mode=$($state.mode) collection_ui=$($state.collectionUI)" }
  Write-Host "version=$((Get-Content package.json -Raw | ConvertFrom-Json).version) node=$node"
  Write-Host "database=$(Get-DatabasePath)"
  if (Test-Path -LiteralPath (Get-DatabasePath)) { Invoke-Npm @("run","db:status") } else { Write-Warn "database가 아직 없습니다." }
  $backupDir = if ($env:NEARBY_JOBS_BACKUP_DIR) {
    if ([IO.Path]::IsPathRooted($env:NEARBY_JOBS_BACKUP_DIR)) { [IO.Path]::GetFullPath($env:NEARBY_JOBS_BACKUP_DIR) } else { [IO.Path]::GetFullPath((Join-Path $script:ProjectRoot $env:NEARBY_JOBS_BACKUP_DIR)) }
  } else { Join-Path $script:ProjectRoot "data\backups" }
  $latest = Get-ChildItem -LiteralPath $backupDir -Filter "*.manifest.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  Write-Host "latest_backup=$(if($latest){$latest.BaseName -replace '\.manifest$',''}else{'none'})"
} catch { Write-Fail $_.Exception.Message; exit 1 }
