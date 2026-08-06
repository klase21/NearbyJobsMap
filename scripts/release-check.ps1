[CmdletBinding()]param([switch]$SkipBuild)
. (Join-Path $PSScriptRoot "windows-common.ps1")
Enter-ProjectRoot
try {
  $required=@("README.md","LICENSE","CONTRIBUTING.md","SECURITY.md","CODE_OF_CONDUCT.md","CHANGELOG.md","docs\WINDOWS_INSTALL.md","docs\TROUBLESHOOTING.md","docs\ARCHITECTURE.md",".env.example",".github\workflows\ci.yml")
  foreach($file in $required){if(-not(Test-Path -LiteralPath $file)){throw "필수 파일 누락: $file"}}
  Invoke-Npm @("run","release:audit")
  Invoke-Npm @("run","typecheck")
  Invoke-Npm @("run","lint")
  Invoke-Npm @("test")
  if(-not $SkipBuild){Invoke-Npm @("run","build")}
  $temp=Join-Path ([IO.Path]::GetTempPath()) ("nearby-jobs-release-check-"+[guid]::NewGuid().ToString("N")+".sqlite")
  try{$old=$env:NEARBY_JOBS_DB_PATH;$env:NEARBY_JOBS_DB_PATH=$temp;Invoke-Npm @("run","db:migrate");Invoke-Npm @("run","db:status")}finally{$env:NEARBY_JOBS_DB_PATH=$old;Remove-Item -LiteralPath $temp,"$temp-wal","$temp-shm" -Force -ErrorAction SilentlyContinue}
  if(git status --porcelain){Write-Warn "작업 트리에 변경이 있습니다. 커밋 후 release-check를 다시 실행하세요."}else{Write-Pass "Git 작업 트리가 깨끗합니다."}
  Write-Pass "release check 완료"
}catch{Write-Fail $_.Exception.Message;exit 1}
