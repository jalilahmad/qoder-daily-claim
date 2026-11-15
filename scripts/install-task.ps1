# install-task.ps1 - Register a daily Windows Scheduled Task for the Qoder credit claim.
#
# Qoder's claim window opens at 10:00 Singapore time (UTC+8) and closes just before
# 10:00 the next day. This script converts that to your local time automatically and
# schedules the run 15 minutes after the window opens.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Time "07:30"
#   powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Uninstall

param(
    [string]$Time = "",          # local HH:mm; auto-computed from UTC+8 when omitted
    [string]$TaskName = "Qoder Daily Credit Claim",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task: $TaskName"
    } else {
        Write-Host "No scheduled task named '$TaskName' found."
    }
    exit 0
}

$scriptPath = Join-Path $here "run-claim.ps1"
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: run-claim.ps1 not found next to this script."
    exit 1
}

# Work out the local time that corresponds to 10:15 in UTC+8.
if (-not $Time) {
    try {
        # 10:15 in UTC+8 is 02:15 UTC. Convert that to local time.
        $windowOpenUtc = [DateTime]::UtcNow.Date.AddHours(2).AddMinutes(15)
        $local = [System.TimeZoneInfo]::ConvertTimeFromUtc($windowOpenUtc, [System.TimeZoneInfo]::Local)
        $Time = $local.ToString("HH:mm")
        Write-Host "Computed local claim time: $Time (10:15 UTC+8 in your timezone)"
    } catch {
        $Time = "06:45"
        Write-Host "Could not compute local time; defaulting to $Time"
    }
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

# Retry hourly for 4 hours if the first attempt fails (asleep, no network).
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At $Time `
    -RepetitionInterval (New-TimeSpan -Minutes 60) `
    -RepetitionDuration (New-TimeSpan -Hours 4)).Repetition

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Claims Qoder's daily free credits automatically." `
    -Force | Out-Null

Write-Host ""
Write-Host "Registered scheduled task: $TaskName"
Write-Host "  Runs daily at $Time (local), retrying hourly for 4 hours."
Write-Host "  Script: $scriptPath"
Write-Host ""
Write-Host "Verify:  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "Run now: Start-ScheduledTask -TaskName '$TaskName'"
