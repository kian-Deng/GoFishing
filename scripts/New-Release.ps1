param(
  [ValidateSet('all', 'server', 'web')][string]$Mode = 'all',
  [string]$Branch = 'main'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
  if ($Branch -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._/-]*$') { throw 'Invalid branch' }
  $commit = git rev-parse HEAD
  if ($LASTEXITCODE -ne 0) { throw 'Initialize Git and commit the project first' }
  $changes = git status --porcelain
  if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Commit all changes before generating a release' }
  $currentBranch = git branch --show-current
  if ($currentBranch -ne $Branch) { throw "Current branch is not $Branch" }
  $remote = git ls-remote origin "refs/heads/$Branch"
  if ($LASTEXITCODE -ne 0 -or -not $remote -or ($remote -split '\s+')[0] -ne $commit) {
    throw 'Push this commit to GitHub before generating a release'
  }
  $outputDir = Join-Path $projectRoot '.releases'
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  $script = @'
#!/usr/bin/env bash
set -Eeuo pipefail
mode=${1:-__MODE__}
repo=${2:-/opt/gofishing}
cd "$repo"
bash scripts/deploy.sh "$mode" '__BRANCH__' '__COMMIT__'
'@
  $script = $script.Replace('__MODE__', $Mode).Replace('__BRANCH__', $Branch).Replace('__COMMIT__', $commit.Trim())
  $path = Join-Path $outputDir "publish-$($commit.Substring(0,12))-$Mode.sh"
  [System.IO.File]::WriteAllText($path, $script.Replace("`r`n", "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
  Write-Output "Generated: $path"
  Write-Output 'Copy this script to the server; run bash publish-*.sh all|server|web /opt/gofishing'
} finally { Pop-Location }
