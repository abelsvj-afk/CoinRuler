<#
Install git hooks for this repository (Windows PowerShell).
Run from the repo root: .\scripts\install-git-hooks.ps1
#>
Param()

Write-Host "Installing git hooks..."
$root = Get-Location
$hookDir = Join-Path $root '.git\hooks'
if (!(Test-Path $hookDir)) {
  Write-Error ".git hooks directory not found. Are you running from the repository root?"
  exit 1
}

$target = Join-Path $hookDir 'pre-commit'

$sh = @'
#!/bin/sh
node "$(git rev-parse --show-toplevel)/scripts/pre-commit.js"
'@

Set-Content -Path $target -Value $sh -Encoding UTF8

try {
  # try to make executable on systems that support it
  & git update-index --add --chmod=+x $target 2>$null
} catch {
  # not critical
}

Write-Host "Installed pre-commit hook at: $target"
Write-Host "If you use Git GUIs or different shells, ensure hooks are executable."
