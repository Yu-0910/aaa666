param(
  [string]$Name = "prod",
  [string]$Commit = "",
  [switch]$PrintOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot

function Invoke-GitText {
  param([string[]]$GitArgs)
  $output = & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed"
  }
  return ($output | Out-String).Trim()
}

function Test-WorktreeClean {
  param([string]$Path)
  $status = & git -C $Path status --porcelain=v1 --untracked-files=all
  if ($LASTEXITCODE -ne 0) {
    throw "git -C $Path status failed"
  }
  return [string]::IsNullOrWhiteSpace(($status | Out-String))
}

function Ensure-LinkOrCopy {
  param(
    [string]$SourcePath,
    [string]$TargetPath,
    [ValidateSet("Junction", "CopyFile")]
    [string]$Mode
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) { return }
  if (Test-Path -LiteralPath $TargetPath) { return }

  if ($Mode -eq "Junction") {
    New-Item -ItemType Junction -Path $TargetPath -Target $SourcePath | Out-Null
    return
  }

  Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
}

$safeName = ($Name.Trim() -replace '[^A-Za-z0-9._-]+', '-')
if ([string]::IsNullOrWhiteSpace($safeName)) {
  throw "Name is empty"
}

$targetPath = Join-Path $repoRoot ".codex-worktrees/$safeName"
if ($PrintOnly) {
  Write-Output $targetPath
  exit 0
}

$targetCommit = if ([string]::IsNullOrWhiteSpace($Commit)) {
  Invoke-GitText -GitArgs @("rev-parse", "HEAD")
} else {
  Invoke-GitText -GitArgs @("rev-parse", $Commit)
}

$insideRoot = [System.IO.Path]::GetFullPath($targetPath).StartsWith(
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot ".codex-worktrees")),
  [System.StringComparison]::OrdinalIgnoreCase
)
if (-not $insideRoot) {
  throw "Refusing to manage worktree outside .codex-worktrees"
}

if (-not (Test-Path -LiteralPath (Split-Path $targetPath -Parent))) {
  New-Item -ItemType Directory -Path (Split-Path $targetPath -Parent) | Out-Null
}

if (-not (Test-Path -LiteralPath $targetPath)) {
  & git worktree add --detach $targetPath $targetCommit
  if ($LASTEXITCODE -ne 0) {
    throw "git worktree add failed"
  }
} else {
  if (-not (Test-WorktreeClean -Path $targetPath)) {
    throw "Deploy worktree is dirty: $targetPath"
  }
  & git -C $targetPath checkout --detach $targetCommit
  if ($LASTEXITCODE -ne 0) {
    throw "git checkout --detach failed in deploy worktree"
  }
}

Ensure-LinkOrCopy -SourcePath (Join-Path $repoRoot "node_modules") -TargetPath (Join-Path $targetPath "node_modules") -Mode Junction
Ensure-LinkOrCopy -SourcePath (Join-Path $repoRoot ".vercel") -TargetPath (Join-Path $targetPath ".vercel") -Mode Junction
Ensure-LinkOrCopy -SourcePath (Join-Path $repoRoot ".env.local") -TargetPath (Join-Path $targetPath ".env.local") -Mode CopyFile
Ensure-LinkOrCopy -SourcePath (Join-Path $repoRoot ".env") -TargetPath (Join-Path $targetPath ".env") -Mode CopyFile

Write-Output $targetPath
