[CmdletBinding()]
param([string]$OutputDirectory="artifacts",[string]$Version="0.1.0")
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  if($Version -notmatch '^\d+\.\d+\.\d+$'){throw "version 형식이 올바르지 않습니다."}
  $output=[IO.Path]::GetFullPath((Join-Path $script:ProjectRoot $OutputDirectory));$artifactRoot=[IO.Path]::GetFullPath((Join-Path $script:ProjectRoot "artifacts"));if(-not $output.StartsWith($artifactRoot,[StringComparison]::OrdinalIgnoreCase)){throw "release 출력은 artifacts 안에 있어야 합니다."}
  New-Item $output -ItemType Directory -Force|Out-Null
  $stage=Join-Path ([IO.Path]::GetTempPath()) ("NearbyJobsMap-package-"+[guid]::NewGuid().ToString("N"));New-Item $stage -ItemType Directory|Out-Null
  try{
    if (Test-Path -LiteralPath (Join-Path $script:ProjectRoot ".git")) {
      $files=@(git ls-files);if($LASTEXITCODE-ne 0){throw "git ls-files 실패"}
    } else {
      $files=@(Get-ChildItem -LiteralPath $script:ProjectRoot -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($script:ProjectRoot,$_.FullName).Replace('\','/') })
    }
    $exclude='(^|/)(?:node_modules|\.next|data|artifacts|coverage|test-results|playwright-report|blob-report|\.git)(/|$)|(?:\.sqlite3?|\.db(?:-wal|-shm)?|\.zip|\.log|\.env\.local)$'
    $included=@($files|Where-Object{$_ -notmatch $exclude -and ($_ -eq ".env.example" -or $_ -notmatch '(^|/)\.env(?:\.|$)')})
    foreach($file in $included){$destination=Join-Path $stage $file;$parent=Split-Path -Parent $destination;if($parent){New-Item $parent -ItemType Directory -Force|Out-Null};Copy-Item -LiteralPath (Join-Path $script:ProjectRoot $file) -Destination $destination}
    $manifest=[ordered]@{format="nearby-jobs-source-release";version=$Version;createdAt=(Get-Date).ToUniversalTime().ToString("o");application="NearbyJobsMap";kind="windows-source";fileCount=$included.Count;excludes=@("runtime databases","backups","exports","node_modules","build output","environment files","Git history")}
    $manifest|ConvertTo-Json -Depth 4|Set-Content (Join-Path $stage "release-manifest.json") -Encoding UTF8
    $zip=Join-Path $output "NearbyJobsMap-$Version-windows-source.zip";Remove-Item $zip -Force -ErrorAction SilentlyContinue;Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
    $hash=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant();Set-Content "$zip.sha256" "$hash  $(Split-Path $zip -Leaf)" -Encoding ASCII;$manifest.sha256=$hash;$manifest|ConvertTo-Json -Depth 4|Set-Content "$zip.manifest.json" -Encoding UTF8
    Write-Pass "source archive=$zip";Write-Host "sha256=$hash files=$($included.Count)"
  }finally{Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue}
}catch{Write-Fail $_.Exception.Message;exit 1}
