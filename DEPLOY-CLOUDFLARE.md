# Deploy AkiraScan no Cloudflare Pages

Repositório **privado** no GitHub → GitHub Pages gratuito não funciona.  
Este guia usa **Cloudflare Pages** (frontend estático) + **Pages Functions** (`/api/cloud/*`) + **R2** (capítulos).

## Arquitetura

| Camada | Conteúdo |
|--------|----------|
| **Pages (estático)** | HTML, JS, CSS, `catalogo.json` (metadados) |
| **Pages Functions** | `/api/cloud/chapters-index`, `/api/cloud/pages`, `/api/cloud/page`, `/api/cloud/publish` |
| **R2 (`akira-chapters`)** | Imagens dos capítulos + `index/chapters-index.json` |
| **Bot NexusToons** | Captura → publica via API → purge local imediato |

Capítulos **não** entram no pacote `deploy-cloudflare/`. Imagens e índice ficam no R2.

## Setup inicial (uma vez)

```powershell
cd d:\Users\adm\Downloads\akiragithub
npm install
npx wrangler login
node scripts/cloud/setup-r2.mjs
```

No painel Cloudflare → Pages → **akira-scan** → Settings → **Bindings**:

| Tipo | Nome binding | Valor |
|------|--------------|-------|
| R2 bucket | `CHAPTERS` | `akira-chapters` |
| Secret | `AKIRA_PUBLISH_TOKEN` | token forte (mesmo do bot/CI) |

## URL do site

- **Produção:** `https://akira-scan.pages.dev`
- **Índice:** `GET /api/cloud/chapters-index`
- **Páginas:** `GET /api/cloud/pages?m=&ch=`
- **Imagem:** `GET /api/cloud/page?m=&ch=&n=1`
- **Status:** `GET /api/cloud/status`

## Deploy manual (CLI)

```powershell
npm run deploy:cloudflare
```

Variáveis opcionais: `CF_PAGES_PROJECT=akira-scan`

## Bot — publicação automática

Com `AKIRA_PUBLISH_TOKEN` definido, o bot:

1. Baixa páginas do NexusToons
2. `POST /api/cloud/publish` (multipart) → R2 + índice
3. Atualiza `catalogo.json` local (checkpoint git)
4. Apaga `data/cloud/pages/` local imediato

Secrets no GitHub Actions (`migrate-bulk-hyper.yml`):

| Secret | Descrição |
|--------|-----------|
| `CLOUDFLARE_API_TOKEN` | Deploy Pages via wrangler |
| `AKIRA_PUBLISH_TOKEN` | Autenticação da API de publish |

Variáveis de ambiente do bot:

| Variável | Descrição |
|----------|-----------|
| `AKIRA_PUBLISH_TOKEN` | Token Bearer para publish/sync |
| `AKIRA_PUBLISH_BASE_URL` | Padrão: `https://akira-scan.pages.dev` |
| `AKIRA_SCAN_BASE_URL` | URL pública do site |
| `AKIRA_PUBLISH_API` | `0` desliga publish remoto (fallback local legado) |

## Migrar caps legados (data/cloud/pages → R2)

```powershell
$env:AKIRA_PUBLISH_TOKEN="seu-token"
node scripts/cloud/migrate-local-pages-to-r2.mjs
```

## Desenvolvimento local

```powershell
npm run dev:cloudflare
```

Abre `http://localhost:8788` com R2 simulado localmente.

## Verificação pós-deploy

```powershell
curl "https://akira-scan.pages.dev/api/cloud/status"
curl "https://akira-scan.pages.dev/api/cloud/chapters-index" -I
```

## Arquivos principais

- `wrangler.jsonc` — binding R2 `CHAPTERS`
- `functions/api/cloud/[[path]].js` — rotas da API
- `scripts/cloud/cloud-api-core.mjs` — lógica R2
- `scripts/cloud/publish-client.mjs` — cliente do bot
- `scripts/prepare-cloudflare-deploy.mjs` — exclui páginas/índice do estático
- `js/services/cloud-chapters-service.js` — frontend lê via API
