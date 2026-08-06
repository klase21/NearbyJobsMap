[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$OutputDirectory = "",
  [switch]$IncludeRecentLogs
)
. (Join-Path $PSScriptRoot "windows-common.ps1")
. (Join-Path $PSScriptRoot "playwright-browser.ps1")
Enter-ProjectRoot

function Resolve-SafeSupportDirectory([string]$Requested) {
  $default = Join-Path $script:ProjectRoot "artifacts\support"
  $candidate = if ([string]::IsNullOrWhiteSpace($Requested)) { $default } elseif ([IO.Path]::IsPathRooted($Requested)) { [IO.Path]::GetFullPath($Requested) } else { [IO.Path]::GetFullPath((Join-Path $script:ProjectRoot $Requested)) }
  $allowed = @([IO.Path]::GetFullPath($default), [IO.Path]::GetFullPath([IO.Path]::GetTempPath()))
  if (-not ($allowed | Where-Object { $candidate.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) { throw "Output is allowed only below <PROJECT_ROOT>\artifacts\support or <TEMP>." }
  return $candidate
}

function Get-SafeDatabaseCounts {
  $dbPath = Get-DatabasePath
  if (-not (Test-Path -LiteralPath $dbPath)) { return [ordered]@{ ready=$false } }
  $env:NEARBY_JOBS_SUPPORT_DB = $dbPath
  try {
    $json = & node -e "const D=require('better-sqlite3');const d=new D(process.env.NEARBY_JOBS_SUPPORT_DB,{readonly:true,fileMustExist:true});const c=n=>d.prepare('SELECT COUNT(*) count FROM '+n).get().count;const tables=new Set(d.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table').map(x=>x.name));const v=n=>tables.has(n)?c(n):null;const dup=d.prepare('SELECT COUNT(*) count FROM (SELECT source,source_posting_id FROM jobs GROUP BY source,source_posting_id HAVING COUNT(*)>1)').get().count;process.stdout.write(JSON.stringify({ready:true,jobs:v('jobs'),ingestionRuns:v('ingestion_runs'),ingestionItems:v('ingestion_items'),provenance:v('job_provenance_history'),savedProfiles:v('saved_collection_profiles'),savedViews:v('saved_job_views'),userStates:v('job_user_state'),observations:v('job_observations'),changeEvents:v('job_change_events'),duplicateSourceIdentities:dup}));d.close()"
    if ($LASTEXITCODE -ne 0) { throw "database aggregate query failed" }
    return $json | ConvertFrom-Json
  } finally { Remove-Item Env:NEARBY_JOBS_SUPPORT_DB -ErrorAction SilentlyContinue }
}

try {
  Assert-NodeVersion | Out-Null
  $output = Resolve-SafeSupportDirectory $OutputDirectory
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $zipPath = Join-Path $output "NearbyJobsMap-support-$stamp.zip"
  if ($WhatIfPreference) { Write-Step "Would create support bundle: $(Protect-LocalText $zipPath)"; exit 0 }
  if (-not $PSCmdlet.ShouldProcess((Protect-LocalText $zipPath), "Create sanitized support bundle")) { exit 0 }
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  $work = Join-Path ([IO.Path]::GetTempPath()) "nearby-jobs-support-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  try {
    $package = Get-Content package.json -Raw | ConvertFrom-Json
    $browser = Get-PlaywrightChromiumStatus
    $gitCommit = (& git rev-parse --short=12 HEAD 2>$null)
    $gitBranch = (& git branch --show-current 2>$null)
    $dirty = [bool](& git status --porcelain 2>$null)
    $envNames = @("NEARBY_JOBS_DB_PATH","NEARBY_JOBS_ENABLE_COLLECTION_UI","NEARBY_JOBS_BACKUP_DIR","PORT","HOSTNAME") | Where-Object { -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, "Process")) }
    $system = [ordered]@{
      application="NearbyJobsMap"; version=$package.version; os=[Environment]::OSVersion.VersionString
      powershell=$PSVersionTable.PSVersion.ToString(); node=(& node --version); npm=(& npm.cmd --version)
      git=[ordered]@{ commit=($gitCommit -join "").Trim(); branch=($gitBranch -join "").Trim(); dirty=$dirty }
      featureFlags=[ordered]@{ collectionUi=($env:NEARBY_JOBS_ENABLE_COLLECTION_UI -eq "1") }
      chromium=[ordered]@{ packageInstalled=$browser.PackageInstalled; executableExists=$browser.ExecutableExists }
      environmentVariableNames=@($envNames); packageLockSha256=(Get-FileHash package-lock.json -Algorithm SHA256).Hash
    }
    $system | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $work "system.json") -Encoding UTF8
    Get-SafeDatabaseCounts | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $work "database-counts.json") -Encoding UTF8
    $doctorLines = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "doctor.ps1") 2>&1
    @($doctorLines | ForEach-Object { Protect-LocalText ([string]$_) } | Where-Object { $_ -match '^(PASS|WARN|FAIL|INFO)' } | Select-Object -Last 120) | Set-Content -LiteralPath (Join-Path $work "doctor.txt") -Encoding UTF8
    $state = Remove-StaleState
    @(
      "application=$(if($null -eq $state){'stopped'}else{'running'})"
      "mode=$(if($null -eq $state){'none'}else{$state.mode})"
      "collection_ui=$(if($null -eq $state){'disabled'}else{$state.collectionUI})"
    ) | Set-Content -LiteralPath (Join-Path $work "status.txt") -Encoding UTF8
    if ($IncludeRecentLogs) {
      $safeLog = Get-ChildItem -LiteralPath $script:RuntimeDirectory -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 2 | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Tail 40 | ForEach-Object { Protect-LocalText ([string]$_) }
      } | Where-Object { $_ -notmatch '(?i)(cookie|authorization|token|password|https?://|posting[_ -]?id|company|title)' }
      @($safeLog | Select-Object -First 80) | Set-Content -LiteralPath (Join-Path $work "recent-sanitized-logs.txt") -Encoding UTF8
    }
    $contentManifest = [ordered]@{
      format="nearby-jobs-support-bundle"; version=1; createdAt=(Get-Date).ToUniversalTime().ToString("o")
      included=@(Get-ChildItem -LiteralPath $work -File | Select-Object -ExpandProperty Name)
      omitted=@("SQLite/WAL/SHM","job and company data","posting IDs and source URLs","notes and per-job workflow","profile names and exclusions","environment values","credentials and cookies","absolute local paths","browser state","screenshots and backups")
      notice="This is a bounded sanitization aid, not a guarantee of anonymity. Inspect before sharing."
    }
    $contentManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $work "manifest.json") -Encoding UTF8
    Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zipPath -CompressionLevel Optimal
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sidecar = "$zipPath.manifest.json"
    [ordered]@{ file=[IO.Path]::GetFileName($zipPath); sha256=$hash; bytes=(Get-Item $zipPath).Length; createdAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $sidecar -Encoding UTF8
    Write-Pass "Support bundle: $(Protect-LocalText $zipPath)"
    Write-Host "SHA-256 $hash"
    Write-Warn "Inspect the ZIP before sharing. It is never uploaded automatically."
  } finally { if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force } }
} catch { Write-Fail (Protect-LocalText $_.Exception.Message); exit 1 }
