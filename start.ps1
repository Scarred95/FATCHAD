# Start FATCHAD locally on Windows: Mongo (docker), FastAPI backend, Vite frontend.
# Usage:
#   .\start.ps1            # start everything (Ctrl-C stops backend + frontend)
#   .\start.ps1 -Down      # also stop the Mongo container on exit
#
# If you hit an execution-policy error, run once in an elevated PowerShell:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

[CmdletBinding()]
param(
    [switch]$Down
)

$ErrorActionPreference = 'Stop'

$RootDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir   = Join-Path $RootDir '.venv'
$ReqFile   = Join-Path $RootDir 'backend\requirements.txt'
$ReqStamp  = Join-Path $VenvDir '.requirements.sha256'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'

Set-Location $RootDir

# 1) Mongo via docker compose
Write-Host '==> Starting Mongo (docker compose up -d)'
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

# 2) Python venv — create if missing
if (-not (Test-Path $VenvPython)) {
    Write-Host '==> Creating venv at .venv'
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        & py -3 -m venv $VenvDir
    } else {
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
        if (-not $pythonCmd) { throw 'Python not found on PATH (need py launcher or python).' }
        & python -m venv $VenvDir
    }
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create venv' }
}

Write-Host '==> Using venv at .venv'

# Install / refresh requirements (only when requirements.txt hash changes)
if (Test-Path $ReqFile) {
    $newHash = (Get-FileHash $ReqFile -Algorithm SHA256).Hash
    $oldHash = if (Test-Path $ReqStamp) { Get-Content $ReqStamp -Raw } else { '' }
    if ($newHash.Trim() -ne $oldHash.Trim()) {
        Write-Host '==> Installing Python requirements'
        & $VenvPython -m pip install --upgrade pip | Out-Null
        & $VenvPython -m pip install -r $ReqFile
        if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
        Set-Content -Path $ReqStamp -Value $newHash -NoNewline
    } else {
        Write-Host '==> Python requirements up to date'
    }
}

# 2b) Frontend node_modules — install if missing
if (-not (Test-Path (Join-Path $RootDir 'frontend\node_modules'))) {
    Write-Host '==> Installing frontend dependencies (npm install)'
    Push-Location (Join-Path $RootDir 'frontend')
    try { npm install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

# 3) Backend (FastAPI / uvicorn) as background process
Write-Host '==> Starting backend (uvicorn) in .\backend'
$backendDir = Join-Path $RootDir 'backend'
$uvicorn    = Join-Path $VenvDir 'Scripts\uvicorn.exe'
$backend = Start-Process -FilePath $uvicorn `
    -ArgumentList 'app.main:app','--reload' `
    -WorkingDirectory $backendDir `
    -NoNewWindow -PassThru

# 4) Frontend (Vite) as background process
Write-Host '==> Starting frontend (npm run dev) in .\frontend'
$frontendDir = Join-Path $RootDir 'frontend'
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
$npmPath = if ($npmCmd) { $npmCmd.Source } else { 'npm' }
$frontend = Start-Process -FilePath $npmPath `
    -ArgumentList 'run','dev' `
    -WorkingDirectory $frontendDir `
    -NoNewWindow -PassThru

function Stop-Children {
    Write-Host ''
    Write-Host '==> Shutting down...'
    foreach ($p in @($backend, $frontend)) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
        }
    }
    if ($Down) {
        Write-Host '==> docker compose down'
        docker compose down
    } else {
        Write-Host '==> Leaving Mongo container running (pass -Down next time to stop it)'
    }
}

try {
    # Wait until either child exits or user hits Ctrl-C
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    Stop-Children
}
