# Cron diário — bulk remoto NexusToons (Windows Task Scheduler)
# Uso manual:  pwsh scripts/cron-daily-bulk.ps1
# Instalar:     npm run setup:cron:daily-bulk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("daily-bulk-{0:yyyy-MM-dd}.log" -f (Get-Date))

function Write-Log($msg) {
    $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $msg
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Write-Log "=== Daily bulk remoto iniciado ==="

# Carregar .env se existir
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
    Write-Log ".env carregado"
}

$env:HOSTING_ADAPTER = "catbox"
$env:NEXUSTOONS_HOSTING_ADAPTER = "catbox"
$env:CATBOX_STATIC_FALLBACK = "false"
$env:TELEGRA_SKIP = "1"
$env:NEXUSTOONS_PURGE_LOCAL = "1"
$env:AKIRA_SKIP_CLOUD_PAGES = "1"
$env:NEXUSTOONS_SYNC_ONLY_NEW = "1"
$env:NEXUSTOONS_USE_PLAYWRIGHT = "1"

Write-Log "Modo: latest-only (caps novos)"
node scripts/run-remote-bulk.mjs --all --latest-only --no-deploy 2>&1 | Tee-Object -FilePath $LogFile -Append
if ($LASTEXITCODE -ne 0) {
    Write-Log "Bulk falhou (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Log "Rebuild catálogo…"
& node scripts/build-catalog-index.mjs 2>&1 | Add-Content $LogFile

Write-Log "=== Daily bulk concluído ==="
exit 0
