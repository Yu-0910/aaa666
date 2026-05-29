[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$repoRoot = $PSScriptRoot | Split-Path -Parent
Set-Location $repoRoot
Write-Host "[helper] cwd = $repoRoot"
& npm run audit:vs-hand-full
exit $LASTEXITCODE
