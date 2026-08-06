[CmdletBinding()]
param([Alias("File")][Parameter(Mandatory=$true)][string]$BundleFile)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
$allowed = @("system.json","database-counts.json","doctor.txt","status.txt","manifest.json","recent-sanitized-logs.txt")
$work = Join-Path ([IO.Path]::GetTempPath()) "nearby-jobs-support-audit-$([guid]::NewGuid().ToString('N'))"
try {
  $path = [IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($BundleFile)){$BundleFile}else{Join-Path $script:ProjectRoot $BundleFile}))
  if (-not (Test-Path -LiteralPath $path) -or [IO.Path]::GetExtension($path) -ne ".zip") { throw "Support ZIP not found." }
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  Expand-Archive -LiteralPath $path -DestinationPath $work
  $files = @(Get-ChildItem -LiteralPath $work -Recurse -File)
  foreach ($file in $files) {
    if ($file.DirectoryName -ne $work -or $file.Name -notin $allowed) { throw "Unsupported file: $($file.Name)" }
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    if ($bytes.Length -ge 16 -and [Text.Encoding]::ASCII.GetString($bytes,0,16) -eq "SQLite format 3`0") { throw "SQLite content detected." }
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    if ($text -match '(?i)(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|authorization\s*[:=]|cookie\s*[:=]|password\s*[:=]|api[_-]?key\s*[:=]|C:\\Users\\[^<]|/home/[^<]|jobkorea\.co\.kr|albamon\.com|source[_ -]?posting[_ -]?id)') { throw "Sensitive or forbidden pattern: $($file.Name)" }
  }
  foreach ($required in @("system.json","database-counts.json","doctor.txt","status.txt","manifest.json")) { if ($required -notin $files.Name) { throw "Required file missing: $required" } }
  Write-Pass "Support bundle structure and bounded-pattern audit passed."
  Write-Warn "This does not guarantee anonymity. Inspect the contents before sharing."
} catch { Write-Fail (Protect-LocalText $_.Exception.Message); exit 1 } finally { if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force } }
