# Deploy AkiraScan no Cloudflare Pages (modo gratuito)

Repositório **privado** no GitHub → GitHub Pages gratuito não funciona.  
Este guia usa **Cloudflare Pages** (frontend) + **Pages Functions** (`/api/cloud/*`) **sem R2, sem cartão, sem serviços pagos**.

## Arquitetura gratuita

| Camada | Conteúdo | Custo |
|--------|----------|-------|
| **Pages (estático)** | HTML, JS, CSS, `catalogo.json` (metadados) | Grátis |
| **Pages Functions** | `/api/cloud/chapters-index`, `/api/cloud/pages`, `/api/cloud/index/chapter` | Grátis |
| **GitHub (raw + API)** | `data/cloud/chapters-index.json` — índice JSON pequeno | Grátis |
| **Catbox.moe** | Imagens dos capítulos (URLs no índice) | Grátis |
| **Bot NexusToons** | Captura → Catbox → índice local + sync API/git | Grátis |

Capítulos **não** entram no pacote `deploy-cloudflare/`. Imagens ficam no Catbox; só metadados (URLs) no índice GitHub.

### Fluxo de publicação

```
NexusToons → Bot baixa páginas → Upload Catbox.moe
           → Atualiza data/cloud/chapters-index.json (local)
           → PUT /api/cloud/index/chapter (sync imediato via GitHub API)
           → Checkpoint git (Actions commita índice a cada 15 min)
           → Frontend lê GET /api/cloud/chapters-index → URLs Catbox
```

## Setup inicial (uma vez)

```powershell
cd d:\Users\adm\Downloads\akiragithub
npm install
npx wrangler login
```

No painel Cloudflare → Pages → **akira-scan** → Settings → **Environment variables**:

| Tipo | Nome | Valor |
|------|------|-------|
| Secret | `AKIRA_PUBLISH_TOKEN` | token forte (mesmo do bot/CI) |
| Secret | `GITHUB_TOKEN` | PAT com escopo `repo` (repo privado) |
| Plain | `GITHUB_REPO` | `olavoprovisaosolar-byte/akira-scan` |
| Plain | `GITHUB_BRANCH` | `main` |

**Não é necessário** habilitar R2 nem adicionar cartão. O binding `CHAPTERS` (R2) é opcional — só use se quiser migrar para R2 no futuro.

## URL do site

- **Produção:** `https://akira-scan.pages.dev`
- **Índice:** `GET /api/cloud/chapters-index`
- **Páginas:** `GET /api/cloud/pages?m=&ch=` (retorna URLs Catbox diretas)
- **Status:** `GET /api/cloud/status` (mostra `storage: "github"`)

## Deploy manual (CLI)

```powershell
npm run deploy:cloudflare
```

Variáveis opcionais: `CF_PAGES_PROJECT=akira-scan`

## Bot — publicação automática

Com `AKIRA_PUBLISH_TOKEN` definido, o bot:

1. Baixa páginas do NexusToons
2. Upload para **Catbox.moe** (`HOSTING_ADAPTER=catbox`)
3. Grava índice local + `PUT /api/cloud/index/chapter` (sync GitHub)
4. Checkpoint git commita `chapters-index.json` periodicamente
5. Apaga `data/cloud/pages/` local imediato

Secrets no GitHub Actions (`migrate-bulk-hyper.yml`):

| Secret | Descrição |
|--------|-----------|
| `CLOUDFLARE_API_TOKEN` | Deploy Pages via wrangler |
| `AKIRA_PUBLISH_TOKEN` | Autenticação da API de publish/sync |

Variáveis de ambiente do bot:

| Variável | Descrição |
|----------|-----------|
| `HOSTING_ADAPTER` | `catbox` (padrão em hyper/CI) |
| `CATBOX_STATIC_FALLBACK` | `false` em CI — não grava imagens locais |
| `TELEGRA_SKIP` | `1` — pula Telegra (bloqueado) |
| `AKIRA_PUBLISH_TOKEN` | Token Bearer para sync de índice |
| `AKIRA_PUBLISH_BASE_URL` | Padrão: `https://akira-scan.pages.dev` |
| `AKIRA_PUBLISH_API` | `0` desliga sync remoto (só git local) |

## Migrar caps em massa (GitHub Actions)

Actions → **Migrate Bulk Hyper (Cloud)** → Run workflow

Ou localmente:

```powershell
node scripts/cloud-hyper-run.mjs --all --hyper
```

## Desenvolvimento local

```powershell
npm run dev:cloudflare
```

Abre `http://localhost:8788` — índice lido de `data/cloud/chapters-index.json` local.

## Verificação pós-deploy

```powershell
curl "https://akira-scan.pages.dev/api/cloud/status"
curl "https://akira-scan.pages.dev/api/cloud/chapters-index" -I
```

Resposta esperada em `/status`:

```json
{ "storage": "github", "hasR2": false, "hasGitHubToken": true, "total": 123 }
```

## R2 (opcional, pago após free tier)

Se quiser usar R2 no futuro:

```powershell
node scripts/cloud/setup-r2.mjs
```

Adicione binding `CHAPTERS` → `akira-chapters` no painel Pages. A API usa R2 automaticamente quando o binding existe; senão, GitHub.

## Arquivos principais

- `functions/api/cloud/[[path]].js` — rotas da API
- `scripts/cloud/cloud-api-core.mjs` — lógica índice (GitHub/R2)
- `scripts/cloud/github-index-store.mjs` — leitura raw + escrita GitHub API
- `scripts/cloud/publish-client.mjs` — cliente sync do bot
- `bots/nexustoons-akira/hosting/catbox.js` — upload Catbox
- `scripts/prepare-cloudflare-deploy.mjs` — exclui páginas/índice do estático
- `js/services/cloud-chapters-service.js` — frontend lê via API
