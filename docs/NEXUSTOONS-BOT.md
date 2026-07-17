# Bot NexusToons → Akira Scan

Pipeline modular para capturar capítulos do [NexusToons](https://nexustoons.com/) e publicar no [Akira Scan](https://akira-scan.pages.dev) via **Telegra.ph** + índice estático `data/cloud/chapters-index.json`.

## Arquitetura

```
bots/nexustoons-akira/
├── index.js              # Orquestrador principal (CLI)
├── capture/
│   ├── nexus-scraper.mjs # Facade scrape + pipeline completo
│   ├── nexustoons.js     # Catálogo OrionCrypto (axios)
│   └── nexustoons-playwright.mjs  # Páginas Turnstile
├── shared/
│   └── stream-page-processor.mjs  # Download stream + sharp (<150 MB RAM)
├── config.json           # URLs base (override via env)
├── config.mangas.json    # Mangás monitorados
├── hosting/              # Telegra.ph primário → cloud-static fallback
├── upload/               # JSON hospedado → catálogo + índice cloud
├── orchestrator/run.mjs  # Alias legado → index.js
└── shared/
    ├── config.js         # Carrega config.json + env
    ├── state.js          # Anti-duplicata (state.json)
    ├── manifest.js       # Tracking de download
    ├── schema.js
    ├── logger.js         # [INFO] [ERRO] [SUCESSO]
    └── ids.js
```

## Nexus Scraper (facade)

Facade unificada que combina `nexustoons.js` (catálogo) + `nexustoons-playwright.mjs` (páginas):

```bash
# Pipeline completo: scrape → Telegra → cloud-static fallback → upload → state → ghost cleanup
npm run bot:scrape:nexus -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro

# Só metadados + URLs (sem hosting)
node bots/nexustoons-akira/capture/nexus-scraper.mjs --slug=SLUG --scrape-only

# Capítulos específicos
npm run bot:scrape:nexus -- --slug=SLUG --chapters=1,2,3 --dry-run
```

Saída de `scrapeNexusToons(slug)`:

```json
{
  "slug": "...",
  "nexusId": "123",
  "title": "Manga Title",
  "chapters": [{ "id": 1, "number": 1, "title": "Cap 1", "imageUrls": ["https://..."] }]
}
```

**RAM:** processamento stream com concorrência 1–2 (`STREAM_PAGE_CONCURRENCY`), `sharp.cache(false)`, purge imediato de temps — ~80–120 MB por capítulo típico.

**Hosting:** Telegra.ph primário (`TELEGRA_SKIP=0`); fallback automático para `cloud-static` (`data/cloud/pages/`) em HTTP 400. Sem Catbox, sem GitHub para storage final.

## Fluxo

```
1. Fetch caps recentes NexusToons
2. Verificar state.json, chapters-index.json (Telegra) e catalogo.json → skip silencioso com `[INFO] skip`
3. Capture  → URLs CDN temporárias
4. Hosting  → upload sequencial Telegra (página 1 → 2 → 3...)
5. Upload   → formato estruturado JSON → catálogo + índice
6. Registrar em state.json
```

## Configuração

### config.json

```json
{
  "nexustoonsBaseUrl": "https://nexustoons.com",
  "akiraScanBaseUrl": "https://akira-scan.pages.dev",
  "telegraUploadUrl": "https://telegra.ph/upload"
}
```

**Nota (2024+):** O upload em `telegra.ph/upload` foi **descontinuado pela Telegram** (HTTP 400). O bot tenta Telegra/graph.org e, ao falhar, usa **fallback estático** em `data/cloud/pages/` servido pelo Cloudflare Pages (`akira-scan.pages.dev`).

Override via env:

| Variável | Descrição |
|----------|-----------|
| `NEXUSTOONS_BASE_URL` | URL base NexusToons |
| `AKIRA_SCAN_BASE_URL` | URL base Akira Scan |
| `TELEGRA_UPLOAD_URL` | Endpoint upload Telegra (padrão `https://telegra.ph/upload`; também tenta `https://graph.org/upload`) |
| `TELEGRA_STATIC_FALLBACK` | `false` desativa fallback estático (padrão: ativo) |
| `TELEGRA_SKIP` | `1` ou `true` — pula Telegra e grava direto em `data/cloud/pages/` |
| `HOSTING_ADAPTER` | `cloud-static` — adapter direto (sem módulo Telegra); padrão `telegra` |
| `PAGE_DOWNLOAD_CONCURRENCY` | Alias de `NEXUSTOONS_PAGE_CONCURRENCY` para downloads paralelos |
| `NEXUSTOONS_DEFER_CATALOG` | `1` — grava catálogo/índice ao final de cada mangá (state.json continua por cap) |
| `NEXUSTOONS_OVERLAP_PIPELINE` | `1` — overlap captura N+1 durante hosting de cap N (mesmo mangá) |
| `SHARP_SKIP_REENCODE` | `1` — pula re-encode JPEG/WebP válidos abaixo do limite |

### config.mangas.json

```json
{
  "mangas": [
    {
      "nexusSlug": "reencarnacao-do-deus-demonio",
      "akiraId": "obra-xxxxxxxx",
      "enabled": true
    }
  ]
}
```

### state.json (anti-duplicata)

Local: `data/nexustoons/state.json`

```json
{
  "processed": {
    "manga-slug/cap-abc12345-01": {
      "processedAt": "2026-07-16T12:00:00.000Z",
      "chapterNumber": "1",
      "akiraMangaId": "obra-xxxxxxxx"
    }
  }
}
```

## CLI

```bash
npm run bot:nexustoons
```

Flags:

| Flag | Descrição |
|------|-----------|
| `--slug=SLUG` | Processar apenas um mangá |
| `--limit=N` | Limitar quantidade de mangás |
| `--dry-run` | Detectar caps novos sem baixar |
| *(padrão)* / `--latest-only` | Apenas o capítulo mais recente por mangá |
| `--all-recent` | Todos os caps novos por mangá em `config.mangas.json` (ordem decrescente) |
| `--all-chapters` | **Backfill**: histórico completo do `--slug` (ordem crescente 1→N). Exige `--slug` |
| `--batch-deploy` | Deploy Cloudflare Pages **uma vez** ao final (não por capítulo) | Auto no bulk |
| `--no-deploy` | Bulk sem deploy final | — |

### Importação bulk (production)

Script dedicado com checkpoint atômico, rate limit, progress bar e deploy em lote:

```bash
npm run bot:nexustoons:bulk -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro
```

Background com log (PowerShell):

```powershell
npm run bot:nexustoons:bulk -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro 2>&1 | Tee-Object logs\bulk-gye-baeksun.log
```

| Recurso | Comportamento |
|---------|---------------|
| Checkpoint | Lê `state.json` antes; salva **imediatamente** após cada cap OK |
| Capítulos | Sequencial (concorrência = 1) |
| Páginas | Download paralelo (6 por capítulo em bulk; 3 no modo normal), upload sequencial |
| Rate limit | `NEXUSTOONS_DELAY_MS` entre requests NexusToons (300 ms bulk / 800 ms normal); backoff 2s→4s→8s em 429/503 |
| Imagens | Sharp valida integridade; AVIF/WebP → JPEG |
| Fallback | Telegra bloqueado → `data/cloud/pages/` silencioso; `TELEGRA_SKIP=1` pula Telegra desde o início |
| Deploy | `prepare:cloudflare` + `wrangler pages deploy` **só no final** |

Variáveis extras:

| Variável | Padrão (bulk) | Descrição |
|----------|---------------|-----------|
| `NEXUSTOONS_PAGE_CONCURRENCY` / `PAGE_DOWNLOAD_CONCURRENCY` | 6 | Downloads paralelos por capítulo |
| `NEXUSTOONS_CHAPTER_DELAY_MS` | 800 | Pausa entre capítulos |
| `NEXUSTOONS_DELAY_MS` | 300 | Throttle requests NexusToons / Playwright |
| `NEXUSTOONS_PW_SETTLE_MS` | 1500 | Espera após warmup Playwright |
| `TELEGRA_SKIP` | — | `1` / `true` → cloud-static direto (sem tentar Telegra) |
| `TELEGRA_DELAY_MS` | 600 (0 se `TELEGRA_SKIP`) | Pausa entre uploads Telegra |
| `TELEGRA_RETRIES` | 3 (1 em turbo) | Tentativas por página no Telegra |

### Modo turbo (migração global acelerada)

Telegra está descontinuado (HTTP 400). No bulk, o maior ganho vem de **pular Telegra** e aumentar concorrência de download.

```powershell
# Opção 1 — script npm (recomendado)
npm run migrate:bulk:all:turbo

# Opção 2 — env manual
$env:TELEGRA_SKIP="1"
$env:NEXUSTOONS_DELAY_MS="200"
$env:PAGE_DOWNLOAD_CONCURRENCY="8"
npm run migrate:bulk:all
```

O flag `--turbo` em `run-bulk-migration.mjs` aplica automaticamente:

| Variável | Valor turbo |
|----------|-------------|
| `TELEGRA_SKIP` | `1` |
| `NEXUSTOONS_DELAY_MS` | `200` |
| `NEXUSTOONS_CHAPTER_DELAY_MS` | `500` |
| `PAGE_DOWNLOAD_CONCURRENCY` | `8` |
| `TELEGRA_DELAY_MS` | `0` |
| `TELEGRA_RETRIES` | `1` |
| `NEXUSTOONS_PW_SETTLE_MS` | `1200` |

**Reiniciar migração em andamento:** variáveis de ambiente são lidas na **inicialização do processo** — não há hot-reload. Para aplicar turbo numa migração já rodando:

```powershell
# 1. Verificar lock/PID
Get-Content logs\migration-all.lock

# 2. Parar processo (substitua PID)
Stop-Process -Id <PID> -Force

# 3. Reiniciar — state.json preserva checkpoint
npm run migrate:bulk:all:turbo
```

Caps já em `data/nexustoons/state.json` são ignorados (skip silencioso).

**Estimativa de ganho:** ~2–4× mais rápido por capítulo (sem retries Telegra ~15–45 s/página × N páginas; download 8-wide vs 3-wide). Playwright warmup reutiliza browser/context por mangá.

**Trade-offs:** maior risco de rate limit (429) no NexusToons e no CDN de imagens; delays menores podem exigir retry/backoff. Se aparecerem 429 frequentes, suba `NEXUSTOONS_DELAY_MS` para 400–600.

### Modo ultra (máxima velocidade)

Além do turbo, o ultra aplica otimizações agressivas para migração global em massa:

```powershell
npm run migrate:bulk:all:ultra
```

O flag `--ultra` aplica automaticamente (sobre turbo):

| Variável | Valor ultra |
|----------|-------------|
| `HOSTING_ADAPTER` | `cloud-static` (sem carregar módulo Telegra) |
| `TELEGRA_SKIP` | `1` |
| `NEXUSTOONS_DELAY_MS` | `100` |
| `NEXUSTOONS_CHAPTER_DELAY_MS` | `300` |
| `NEXUSTOONS_PW_SETTLE_MS` | `800` |
| `PAGE_DOWNLOAD_CONCURRENCY` | `12` (override via env: `16`) |
| `NEXUSTOONS_DEFER_CATALOG` | `1` — catálogo/índice gravados **ao final de cada mangá** |
| `NEXUSTOONS_OVERLAP_PIPELINE` | `1` — captura cap N+1 durante hosting de cap N |
| `SHARP_SKIP_REENCODE` | `1` — pula re-encode JPEG/WebP válidos |
| `NEXUSTOONS_PW_GOTO_WAIT` | `domcontentloaded` |
| `NEXUSTOONS_PW_BLOCK_HEAVY` | `1` — bloqueia font/css/media/analytics no Playwright |

**Checkpoint atômico:** `state.json` continua sendo salvo **após cada capítulo OK** — só catálogo + `chapters-index.json` são deferidos por mangá.

**Playwright:** páginas de listagem (warmup) bloqueiam apenas imagens; fallback de leitura bloqueia recursos não essenciais.

**Reiniciar em ultra:**

```powershell
Get-Content logs\migration-all.lock
Stop-Process -Id <PID> -Force
npm run migrate:bulk:all:ultra
```

**Estimativa de ganho vs turbo:** ~1.4–2× adicional (~3–6× vs modo bulk normal). Ganhos vêm de: adapter cloud-static (zero overhead Telegra), download 12-wide, overlap capture/hosting, defer I/O catálogo, sharp skip, Playwright mais leve.

**Trade-offs ultra:**

| Risco | Mitigação |
|-------|-----------|
| Rate limit 429 no NexusToons/CDN | Backoff automático; subir `NEXUSTOONS_DELAY_MS` para 200–400 |
| Crash mid-manga perde catálogo defer | `state.json` preserva caps OK; re-run reconstrói catálogo |
| Overlap pipeline stress Playwright | Só dentro do mesmo mangá; desativar com `NEXUSTOONS_OVERLAP_PIPELINE=0` |
| Concorrência 12+ sobrecarrega disco/rede | Reduzir para 8 ou usar turbo |
| Imagens AVIF ainda convertidas | Sharp skip só JPEG/WebP válidos |

Log bulk: `logs/bulk-{slug}.log` + formato `[PROCESSANDO] Cap 05 | Página 12/24 | [||||||||....] 50% | Fallback: Não`

Erros fatais: prefixo `[CRÍTICO]`.

> **Modo padrão = latest-only:** omitir `--all-chapters` e `--all-recent` processa só o capítulo mais recente. Use `--latest-only` para deixar explícito no log/CI.

### Diferença entre modos

| Modo | Escopo | Ordem | Uso |
|------|--------|-------|-----|
| *(padrão)* | 1 cap (mais recente) | — | Cron horário / novos caps |
| `--all-recent` | Todos os caps novos | Decrescente | Recuperar vários caps recentes |
| `--all-chapters` | Histórico completo do slug | Crescente (1, 2, 3…) | Backfill inicial de um mangá |

Exemplos:

```bash
# Teste real — só o capítulo mais recente (Gye Baek-Sun)
npm run bot:nexustoons -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro

# Equivalente explícito
npm run bot:nexustoons -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro --latest-only

npm run bot:nexustoons -- --slug=reencarnacao-do-deus-demonio --dry-run
npm run bot:nexustoons -- --limit=3 --all-recent
npm run bot:nexustoons -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro --all-chapters --dry-run
node bots/nexustoons-akira/index.js --slug=SLUG --all-chapters
```

### Pré-requisitos (captura NexusToons)

O NexusToons exige Playwright para contornar Cloudflare Turnstile nas páginas de leitura:

```bash
npx playwright install chromium
npm install sharp   # conversão AVIF/WebP → JPEG para Telegra
```

Browsers ficam em `.playwright-browsers/` (ou `PLAYWRIGHT_BROWSERS_PATH`). Sem Chromium, a captura falha com erro indicando instalação.

### Verificar resultado

**Local (dev):**

```bash
npm run dev:legacy
# ou
npm run dev:cloudflare
```

Abra o mangá `obra-9010fd2c` e o capítulo publicado. Confira também:

- `data/cloud/chapters-index.json` — entrada `obra-9010fd2c/cap-…` com URLs `telegra.ph`
- `data/catalogo.json` — capítulo listado em `obra-9010fd2c`
- `data/nexustoons/state.json` — cap processado

**Produção (Cloudflare Pages):**

Os JSON locais não aparecem no site ao vivo até redeploy:

```bash
npm run deploy:cloudflare
# ou push na branch que dispara .github/workflows/deploy-pages.yml
```

## Formato JSON para upload

```json
{
  "manga_title": "Reencarnação do Deus Demônio",
  "chapter_number": "15.5",
  "chapter_title": "Capítulo 15.5",
  "source_url": "https://nexustoons.com/manga/slug/15.5",
  "pages": ["https://telegra.ph/file/...", "..."]
}
```

## Logs

Formato obrigatório (prefixos por etapa):

```
[INFO] === NexusToons → Telegra → Akira Scan ===
[INFO] Lendo mangá gye-baeksun-sem-emprego-e-sem-dinheiro...
[INFO] Modo latest-only: capítulo 4 (mais recente)
[INFO] Processando capítulo 4
[NEXUSTOONS] Baixando imagens do Capítulo 4...
[NEXUSTOONS] Capítulo 4: 42 páginas capturadas
[TELEGRA.PH] Upload da página 1/42 concluído
[TELEGRA.PH] Upload da página 2/42 concluído
...
[AKIRA API] Enviando JSON com links finais para a API...
[SUCESSO] Resposta da API da Akira Scan: ok — capítulo 4 publicado (42 páginas Telegra)
[ERRO] Resposta da API da Akira Scan: validação falhou — ...
[ERRO] Falha no upload da página 3
```

Arquivo: `logs/nexustoons-bot.log`

## Telegra.ph — upload sequencial

- **Sequencial**: página 1 completa → página 2 → ...
- **Retries**: 3 tentativas com 2s de delay (`TELEGRA_RETRIES`, `TELEGRA_RETRY_DELAY_MS`)
- **Validação**: magic bytes + tamanho mínimo antes do upload
- **Falha parcial**: capítulo não é marcado como processado

## GitHub Actions

Workflow: `.github/workflows/nexustoons-update-chapters.yml`

- Cron: **hora em hora** (`0 * * * *`)
- Comando: `npm run bot:nexustoons`
- Commita: `state.json`, `manifest.json`, `catalogo.json`, `chapters-index.json`

### Migração bulk hyper na nuvem (sem RAM local)

Workflow: `.github/workflows/migrate-bulk-hyper.yml`

Roda `migrate:bulk:all:hyper` nos servidores GitHub (~7 GB RAM dedicados), com checkpoint periódico em `state.json` + índices. **Retoma** de onde parou — caps já em `state.json` são ignorados.

**Handoff local → nuvem:**

```powershell
# 1. Parar hyper local com segurança + commit checkpoint
npm run migrate:handoff:cloud -- --push

# 2. GitHub → Actions → "Migrate Bulk Hyper (Cloud)" → Run workflow
#    mode: hyper | slug: (vazio) | deploy: true
```

Ou manualmente:

```powershell
Get-Content logs\migration-all.lock
Stop-Process -Id <PID> -Force
git add data/nexustoons/state.json data/catalogo.json data/cloud/chapters-index.json
git commit -m "chore: handoff checkpoint"
git push
```

**Secrets (Settings → Secrets → Actions):**

| Secret | Uso |
|--------|-----|
| `CLOUDFLARE_API_TOKEN` | Deploy final Cloudflare Pages (opcional se `deploy=false`) |

**Parâmetros do workflow:**

| Input | Padrão | Descrição |
|-------|--------|-----------|
| `slug` | vazio | Um mangá; vazio = fila completa pendente |
| `mode` | hyper | `hyper` ou `ultra` |
| `deploy` | true | Wrangler deploy ao final |
| `sync_interval_minutes` | 15 | Commit git de checkpoint |
| `manga_parallel` | 3 | Reduza para `2` se OOM no runner |

**Tempo:** ~2–4 h (mesmo hyper local). **Custo:** ~2–4 h de minutos Actions (2000 min/mês em repo privado; ilimitado em público).

**Limite 6 h:** se expirar, rode o workflow de novo — retoma do `state.json`.

**Alternativa VPS (~$5/mês):** Ubuntu 4 GB+, `git clone`, `npm ci`, `npx playwright install chromium --with-deps`, `npm run migrate:cloud:hyper -- --no-deploy` (sem sync git automático; use cron ou push manual).

## Testes

```bash
npm test -- bots/nexustoons-akira/hosting/telegra.test.mjs
npm test -- bots/nexustoons-akira/shared/chapters.test.mjs
npm test -- bots/nexustoons-akira/capture/nexus-scraper.test.mjs
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Cap reprocessado | Verifique `data/nexustoons/state.json` |
| Falha parcial Telegra | Cap não entra em state.json — reexecute |
| Imagem corrompida | Log `[ERRO] Falha no upload da página X` |
| 403 em caps | `npx playwright install chromium` |
| Captura retorna og-image | Corrigido: Playwright usa `/api/read/{id}` após warmup |
| Páginas AVIF | Requer `sharp` (conversão automática para JPEG no Telegra) |
| Telegra HTTP 400 | Upload descontinuado desde set/2024. Fallback automático: `data/cloud/pages/` → `akira-scan.pages.dev`. Teste: `npm run bot:nexustoons:telegra-probe` |
