$ErrorActionPreference = 'Stop'
$nexusRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $nexusRoot
$nexusUrl = 'http://127.0.0.1:3210'
$nexusRunning = $false
try {
    $nexusResponse = Invoke-WebRequest -Uri "$nexusUrl/api/catalog" -UseBasicParsing -TimeoutSec 2
    $nexusRunning = $nexusResponse.StatusCode -eq 200
} catch {}
if (-not $nexusRunning) {
    $nexusNode = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nexusNode) { throw 'Instale o Node.js 24 ou mais recente para iniciar a P.A Nexus Studio.' }
    if (-not (Test-Path -LiteralPath (Join-Path $nexusRoot 'node_modules'))) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar as dependencias.' }
    }
    Start-Process -FilePath $nexusNode -ArgumentList 'server.js' -WorkingDirectory $nexusRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $nexusRoot 'server.log') -RedirectStandardError (Join-Path $nexusRoot 'server-error.log') | Out-Null
    for ($nexusTry = 0; $nexusTry -lt 30; $nexusTry++) {
        Start-Sleep -Milliseconds 300
        try {
            $nexusResponse = Invoke-WebRequest -Uri "$nexusUrl/api/catalog" -UseBasicParsing -TimeoutSec 1
            if ($nexusResponse.StatusCode -eq 200) { $nexusRunning = $true; break }
        } catch {}
    }
    if (-not $nexusRunning) { throw 'Nao foi possivel iniciar. Consulte server-error.log ou verifique a porta 3210.' }
}
Start-Process $nexusUrl
Write-Host 'P.A Nexus Studio esta pronta em http://127.0.0.1:3210'
