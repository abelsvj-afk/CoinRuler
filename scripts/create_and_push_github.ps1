<#
PowerShell helper to initialize a git repo, commit, and create+push a GitHub repo.

Usage:
  1) Open PowerShell in the project root (C:\Users\Student\Desktop\CoinRuler)
  2) ./scripts/create_and_push_github.ps1 -RepoName CoinRuler -Visibility private

Notes:
 - This script will NOT upload any secrets. Ensure `.env` is in `.gitignore`.
 - If `gh` is not installed, the script will only initialize git and print the manual
   git commands to create a remote and push.
 - You will be prompted to confirm actions before they run.
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$RepoName,
  [ValidateSet('public','private')]
  [string]$Visibility = 'private'
)

function Confirm-Or-Exit($msg) {
  $r = Read-Host "$msg [y/N]"
  if ($r -ne 'y' -and $r -ne 'Y') { Write-Host 'Aborting.'; exit 1 }
}

Write-Host "Preparing to create & push repo '$RepoName' (visibility: $Visibility)" -ForegroundColor Cyan
Confirm-Or-Exit "Proceed?"

# Ensure .gitignore includes secrets
if (-not (Get-Content .gitignore -ErrorAction SilentlyContinue | Select-String -Pattern "^\.env")) {
  Write-Host "Warning: .env not found in .gitignore. It's recommended to keep secrets out of git." -ForegroundColor Yellow
  $r = Read-Host "Add .env to .gitignore now? [y/N]"
  if ($r -eq 'y' -or $r -eq 'Y') { Add-Content .gitignore "`n.env`n"; Write-Host '.env added to .gitignore' }
}

# Initialize git if necessary
if (-not (Test-Path .git)) {
  Write-Host 'Initializing git repository' -ForegroundColor Green
  git init
  git checkout -b main
} else {
  Write-Host 'Git repository already initialized.' -ForegroundColor Green
}

Write-Host 'Staging files (excluding ignored)' -ForegroundColor Green
git add .

try {
  $status = git status --porcelain
  if ($status) { Write-Host 'Uncommitted changes staged.' } else { Write-Host 'No files staged but continuing.' }
} catch {
  Write-Host 'git status failed — ensure git is installed.' -ForegroundColor Red
}

# Detect if repo already has commits
$hasCommits = $false
try {
  git rev-parse --verify HEAD > $null 2>&1
  if ($LASTEXITCODE -eq 0) { $hasCommits = $true }
} catch { $hasCommits = $false }

if (-not $hasCommits) {
  try {
    git commit -m "Initial commit: CoinRuler bot" -q
    Write-Host 'Committed initial commit.' -ForegroundColor Green
  } catch {
    Write-Host 'No changes to commit or commit failed.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Repository already has commits.'
}

# If gh CLI is installed, use it to create the repo and push
try {
  Get-Command gh -ErrorAction Stop | Out-Null
  Write-Host 'GitHub CLI detected. Creating repo with gh...' -ForegroundColor Green
  gh repo create $RepoName --$Visibility --source=. --remote=origin --push
  Write-Host 'Repo created and pushed via gh.' -ForegroundColor Green
} catch {
  Write-Host 'gh not available or failed. Printing manual commands to run:' -ForegroundColor Yellow
  Write-Host "\n# Manual steps if you already created the GitHub repo via web UI:" -ForegroundColor Cyan
  Write-Host "git remote add origin https://github.com/<your-username>/$RepoName.git" -ForegroundColor White
  Write-Host "git push -u origin main" -ForegroundColor White
  Write-Host "\nOr install GitHub CLI: https://cli.github.com/" -ForegroundColor Cyan
}

Write-Host '\nNext: Connect your GitHub repo to Railway (recommended).' -ForegroundColor Cyan
Write-Host 'Open https://railway.app -> New Project -> Deploy from GitHub -> select your repo -> set environment variables (MONGODB_URI, COINBASE_API_KEY, COINBASE_API_SECRET, DISCORD_TOKEN, OWNER_ID) and deploy.' -ForegroundColor White

Write-Host '\nIf you want, run the migration dry-run now:' -ForegroundColor Cyan
Write-Host 'node scripts/migrate_normalize_deposits.js --coin BTC' -ForegroundColor White

Write-Host '\nScript finished.' -ForegroundColor Green
