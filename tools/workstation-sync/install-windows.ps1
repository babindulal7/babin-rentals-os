# One-time installation on EACH Windows development computer.
# Run as the normal interactive account, never as a GitHub Actions runner.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $RepoPath,
  [string] $TaskName = 'Babin Rentals OS Safe Sync'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$script = Join-Path $repo 'tools\workstation-sync\sync.mjs'
if (-not (Test-Path -LiteralPath $script)) { throw 'Missing sync.mjs: merge the PR into this checkout before installing.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$git  = (Get-Command git.exe -ErrorAction Stop).Source
$gh   = (Get-Command gh.exe -ErrorAction Stop).Source
& $gh auth status 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login in this Windows user account first.' }
$origin = (& $git -C $repo config --get remote.origin.url).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)babindulal7/babin-rentals-os(\.git)?/?$') {
  throw 'Wrong GitHub origin. Stopping.'
}

$localDir = Join-Path $env:LOCALAPPDATA 'BabinRentalsOS'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$launcher = Join-Path $localDir 'safe-sync.cmd'
$log = Join-Path $localDir 'sync.log'
$binDirs = @((Split-Path $node), (Split-Path $git), (Split-Path $gh)) -join ';'
$body = @"
@echo off
set "PATH=$binDirs;%PATH%"
cd /d "$repo"
"$node" "$script" --apply >> "$log" 2>&1
"@
Set-Content -LiteralPath $launcher -Value $body -Encoding ASCII

# Current-user Task Scheduler job, repeating every 15 minutes.
$taskCommand = 'cmd.exe /d /c ""' + $launcher + '""'
& schtasks.exe /Create /F /SC MINUTE /MO 15 /TN $TaskName /TR $taskCommand | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Task Scheduler rejected installation; use the manual README setup.' }
Write-Host "Installed: $TaskName"
Write-Host "Log: $log"
Write-Host ('Inspect: schtasks /Query /TN "' + $TaskName + '" /V /FO LIST')
Write-Host ('Remove:  schtasks /Delete /TN "' + $TaskName + '" /F')
