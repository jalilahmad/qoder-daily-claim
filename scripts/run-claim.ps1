# run-claim.ps1 - Launch Qoder with the DevTools port, run the daily claim, then clean up.
#
# Qoder only exposes its campaign UI over CDP when it starts with
# --remote-debugging-port. If Qoder is already running WITHOUT that flag,
# this script restarts it (Qoder restores its session).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1 -KeepOpen
#   powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1 -QoderPath "D:\Apps\Qoder\Qoder.exe"
#
# Exit codes: 0 = claimed or nothing to claim, 1 = failure.

param(
    [switch]$KeepOpen,          # leave Qoder running afterwards
    [int]$Port = 9222,
    [int]$StartupWaitSec = 40,
    [string]$QoderPath = ""     # optional explicit path to Qoder.exe
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$logFile = Join-Path $root "run-log.txt"

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Host $line
    try { Add-Content -Path $logFile -Value $line -Encoding UTF8 } catch {}
}

# Locate Qoder.exe without hardcoding a user path.
function Find-Qoder {
    param([string]$Explicit)

    if ($Explicit -and (Test-Path $Explicit)) { return $Explicit }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Qoder\Qoder.exe"),
        (Join-Path $env:LOCALAPPDATA "Qoder\Qoder.exe"),
        (Join-Path $env:ProgramFiles "Qoder\Qoder.exe")
    )
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "Qoder\Qoder.exe")
    }
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }

    # Fall back to a running process's path.
    $proc = Get-Process -Name "Qoder" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path) { return $proc.Path }

    return $null
}

function Test-Cdp {
    param([int]$P)
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("Accept", "application/json")
        $r = $wc.DownloadString("http://127.0.0.1:$P/json/version")
        return $r -match "webSocketDebuggerUrl"
    } catch { return $false }
}

Write-Log "=== run start ==="

$qoderExe = Find-Qoder -Explicit $QoderPath
if (-not $qoderExe) {
    Write-Log "ERROR: Qoder.exe not found. Pass -QoderPath explicitly."
    exit 1
}
Write-Log "Qoder: $qoderExe"

if (Test-Cdp -P $Port) {
    Write-Log "Qoder already listening on CDP port $Port"
} else {
    $running = Get-Process -Name "Qoder" -ErrorAction SilentlyContinue
    if ($running) {
        Write-Log "Qoder is running without a debug port; restarting it"
        $running | Stop-Process -Force
        Start-Sleep -Seconds 4
    } else {
        Write-Log "Qoder not running; starting it"
    }

    Start-Process -FilePath $qoderExe -ArgumentList "--remote-debugging-port=$Port"
    Write-Log "launched Qoder with --remote-debugging-port=$Port"

    $ready = $false
    for ($i = 0; $i -lt $StartupWaitSec; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Cdp -P $Port) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Log "ERROR: Qoder did not expose CDP on port $Port within $StartupWaitSec s"
        exit 1
    }
    Write-Log "CDP is up on port $Port"
    Start-Sleep -Seconds 6
}

$env:QODER_CDP_PORT = "$Port"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Log "ERROR: node not found on PATH (install Node.js 18+)"
    exit 1
}

Write-Log "running qoder-claim.js"
$claimScript = Join-Path $root "src\qoder-claim.js"
$out = & node $claimScript 2>&1
$code = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_; try { Add-Content -Path $logFile -Value $_ -Encoding UTF8 } catch {} }

Write-Log "claim exit code: $code"

if (-not $KeepOpen) {
    Write-Log "closing Qoder"
    Get-Process -Name "Qoder" -ErrorAction SilentlyContinue | Stop-Process -Force
}

Write-Log "=== run end ==="
exit $code
