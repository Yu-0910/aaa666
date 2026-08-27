param(
  [string]$Name = "prod",
  [string]$Commit = "",
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot

$worktreePath = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "create_deploy_worktree.ps1") -Name $Name -Commit $Commit
if ($LASTEXITCODE -ne 0) {
  throw "create_deploy_worktree.ps1 failed"
}
$worktreePath = ($worktreePath | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($worktreePath)) {
  throw "deploy worktree path is empty"
}

$status = & git -C $worktreePath status --porcelain=v1 --untracked-files=all
if ($LASTEXITCODE -ne 0) {
  throw "git status failed in deploy worktree"
}
if (-not [string]::IsNullOrWhiteSpace(($status | Out-String))) {
  throw "Deploy worktree is dirty: $worktreePath"
}

Push-Location -LiteralPath $worktreePath
try {
  & npm run deploy:vercel:prod
  if ($LASTEXITCODE -ne 0) {
    throw "npm run deploy:vercel:prod failed"
  }

  if (-not $SkipVerify) {
    & npm run display:r2:verify:production
    if ($LASTEXITCODE -ne 0) {
      throw "npm run display:r2:verify:production failed"
    }
  }
}
finally {
  Pop-Location
}
