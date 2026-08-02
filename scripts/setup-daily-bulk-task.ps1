# Regista tarefa Windows - bulk remoto diario as 03:00 (hora local)
# Uso: npm run setup:cron:daily-bulk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Script = Join-Path $Root "scripts\cron-daily-bulk.ps1"
$TaskName = "AkiraScan-DailyBulk"

if (-not (Test-Path $Script)) {
    Write-Error "Script nao encontrado: $Script"
    exit 1
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`"" `
    -WorkingDirectory $Root

$Trigger = New-ScheduledTaskTrigger -Daily -At "03:00"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "AkiraScan bulk remoto diario" `
    -Force | Out-Null

Write-Host ""
Write-Host "Tarefa agendada: $TaskName"
Write-Host "Horario: todos os dias as 03:00"
Write-Host "Script:  $Script"
Write-Host "Logs:    $Root\logs\daily-bulk-YYYY-MM-DD.log"
Write-Host ""
Write-Host "Testar: npm run bot:daily:bulk"
Write-Host ""
