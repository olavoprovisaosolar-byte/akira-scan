# Copia o AkiraScan para a pasta wwwroot da VM (partilha de rede).
# Uso no PC físico (com ficheiros locais):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-wwwroot.ps1
#
# Opcional: outro destino
#   powershell -File scripts\deploy-wwwroot.ps1 -Destino "\\192.168.100.23\wwwroot"

param(
    [string]$Destino = "\\192.168.100.23\wwwroot",
    [string]$Origem = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$itens = @(
    "index.html",
    "biblioteca.html",
    "manhwa.html",
    "leitor.html",
    "style.css",
    "css",
    "js",
    "scripts",
    "netlify",
    "Biblioteca_Mangas"
)

Write-Host "AkiraScan — deploy para VM"
Write-Host "  Origem:  $Origem"
Write-Host "  Destino: $Destino"
Write-Host ""

if (-not (Test-Path $Destino)) {
    Write-Host "ERRO: Destino inacessivel. Verifica:" -ForegroundColor Red
    Write-Host "  - VM ligada e na mesma rede"
    Write-Host "  - Caminho: $Destino"
    Write-Host "  - Credenciais (Administrador + senha da VM)"
    exit 1
}

foreach ($item in $itens) {
    $src = Join-Path $Origem $item
    if ($item -eq "Biblioteca_Mangas") {
        $luk = Join-Path (Split-Path $Origem -Parent) "servidor 2\servidor\Biblioteca_Mangas"
        $temMangas = (Get-ChildItem $src -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike ".*" }).Count -gt 0
        if (-not $temMangas -and (Test-Path $luk)) {
            Write-Host "Biblioteca local vazia — a usar LUK.TV: $luk" -ForegroundColor Yellow
            $src = $luk
        }
    }
    if (-not (Test-Path $src)) {
        Write-Host "Aviso: nao encontrado — $item" -ForegroundColor Yellow
        continue
    }
    $dst = Join-Path $Destino $item
    Write-Host "Copiando $item ..."
    if (Test-Path $src -PathType Container) {
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        Copy-Item $src $dst -Recurse -Force
    } else {
        Copy-Item $src $dst -Force
    }
}

Write-Host ""
Write-Host "Copia concluida." -ForegroundColor Green
Write-Host ""
Write-Host "Na VM, instala Node.js e executa:"
Write-Host "  node scripts\dev-server.mjs"
Write-Host ""
Write-Host "Coloque os capítulos em Biblioteca_Mangas\slug\capitulo-01\001.jpg ..."
Write-Host "Ou aponte para a pasta do LUK.TV:"
Write-Host "  set BIBLIOTECA_DIR=d:\caminho\Biblioteca_Mangas"
