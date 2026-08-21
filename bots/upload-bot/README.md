# Upload Bot (do zero)

Pipeline limpo: **NexusToons → Freeimage (iili.io) → AkiraScan**.

Sem Catbox, Discord, Telegra, litter ou cloud-static.

## Requisitos (PC)

1. Node 22+
2. `npm ci`
3. Playwright: `npx playwright install chromium`
4. `.env` com cookie se Nexus mostrar Cloudflare:
   ```
   NEXUSTOONS_COOKIE=cf_clearance=...; outros=...
   ```
5. Opcional publish remoto:
   ```
   AKIRA_PUBLISH_TOKEN=...
   AKIRA_PUBLISH_BASE_URL=https://akira-scan.pages.dev
   ```

## Comandos

```bash
# Probe Nexus (exit 3 = Cloudflare bloqueou)
npm run upload:bot -- --probe

# Um mangá — só o capítulo mais recente
npm run upload:bot -- --slug=SEU-SLUG

# Um mangá — todos os capítulos
npm run upload:bot -- --slug=SEU-SLUG --all-chapters

# Todos os mangás enabled em config.mangas.json (1 cap cada)
npm run upload:bot -- --all --latest-only

# Dry-run (não sobe imagens)
npm run upload:bot -- --slug=SEU-SLUG --dry-run

# Watchdog infinito no PC
npm run upload:bot:keep-alive
npm run upload:bot:keep-alive:bg
```

## O que grava

- `data/cloud/chapters-index.json` — páginas `https://iili.io/...`
- `data/catalogo.json` — lista de caps
- `data/nexustoons/state.json` — anti-dupe / resume

Depois: `git add` + commit, ou deixe o workflow de Pages publicar.

## Arquitetura

```
bots/upload-bot/index.mjs     # CLI limpa
bots/upload-bot/keep-alive.mjs
bots/nexustoons-akira/
  capture/                    # scrape Nexus (reutilizado)
  hosting/freeimage-host.js   # upload iili
  upload/akira-scan-api.js    # publish local (+ API opcional)
```
