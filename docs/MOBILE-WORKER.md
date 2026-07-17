# App mobile — Akira Worker (PWA)

Gerencie o Akira Scan pelo celular: dispare migrações hyper/ultra na nuvem, adicione mangás NexusToons e sincronize capítulos — **zero RAM no telefone** (tudo roda no GitHub Actions).

## URL de acesso

```
https://akira-scan.pages.dev/mobile/?pin=c17a69bc
```

Salve nos favoritos do celular. O PIN na URL evita digitar toda vez.

## Setup (uma vez no Cloudflare)

Cloudflare Pages → projeto `akira-scan` → **Settings → Environment variables** (Production):

| Nome | Tipo | Valor |
|------|------|-------|
| `MOBILE_TRIGGER_PIN` | Secret | `c17a69bc` (ou outro PIN forte) |
| `GITHUB_TOKEN` | Secret | PAT GitHub com escopo `repo` + `actions:write` |

Depois faça deploy:

```powershell
cd D:\Users\adm\Downloads\akiragithub
$env:AKIRA_SKIP_CLOUD_PAGES = "1"
npm run deploy:cloudflare
```

## Instalar como app (PWA)

### Android (Chrome)

1. Abra `https://akira-scan.pages.dev/mobile/?pin=c17a69bc`
2. Toque no menu **⋮** → **Instalar app** ou **Adicionar à tela inicial**
3. Confirme — o ícone **Akira Worker** aparece na home

### iPhone (Safari)

1. Abra a URL no Safari
2. Toque em **Compartilhar** (ícone de exportar)
3. **Adicionar à Tela de Início**
4. Toque **Adicionar**

## O que o app faz

### Início (dashboard)

- **Legíveis** — caps com páginas hospedadas (Telegra/cloud)
- **Ativos** — mangás enabled no config
- **Pendentes** — mangás sem caps no índice
- **State** — caps processados no checkpoint
- Status do último job GitHub Actions

### Botões de migração

| Botão | Ação |
|-------|------|
| **🚀 HYPER** | Migração bulk máxima velocidade (3 mangás paralelos, todos caps pendentes) |
| **▶ ULTRA** | Modo mais estável (menos concorrência) |
| **🔄 Só caps novos** | Sync rápido — apenas capítulo mais recente por mangá |

### Mangás

- Lista todos os mangás de `config.mangas.json`
- Mostra contagem de caps e status Telegra
- **🔄** — sync só cap novo daquele mangá
- **↑** — importar todos os caps pendentes daquele mangá

### + Novo

1. Copie o slug da URL NexusToons: `nexustoons.com/manga/SEU-SLUG`
2. Cole no campo **Slug NexusToons**
3. Título opcional
4. Marque **Iniciar importação** para disparar hyper automaticamente
5. Toque **+ Adicionar e importar**

O app edita `config.mangas.json` via GitHub API e dispara o workflow `migrate-bulk-hyper.yml`.

## Fluxo na nuvem

```
Celular (PWA)
    ↓ POST /api/mobile/trigger
Cloudflare Pages Function
    ↓ GitHub Actions dispatch
migrate-bulk-hyper.yml
    ↓ Playwright + Telegra.ph
Checkpoint git → deploy Cloudflare
```

## API

Todas as rotas de escrita exigem header `X-Mobile-Pin` ou query `?pin=`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/mobile/ping` | Valida PIN |
| GET | `/api/mobile/dashboard` | Stats + último workflow |
| GET | `/api/mobile/mangas` | Lista mangás com stats |
| POST | `/api/mobile/trigger` | Dispara migração |
| POST | `/api/mobile/add-manga` | Adiciona mangá ao config |
| POST | `/api/mobile/toggle-manga` | Ativa/desativa mangá |

Exemplo trigger sync caps novos:

```http
POST /api/mobile/trigger
X-Mobile-Pin: c17a69bc
Content-Type: application/json

{"mode":"hyper","deploy":true,"sync_only_new":true}
```

Exemplo importar mangá específico:

```json
{"mode":"hyper","slug":"meu-manga","deploy":true,"all_chapters":true}
```

## O que NÃO roda no celular

| Tentativa | Por quê |
|-----------|---------|
| Node + Playwright no Termux | Sem Chromium/Turnstile estável |
| Captura local | NexusToons exige browser desktop |

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `/mobile/` retorna 404 | Rode deploy com `AKIRA_SKIP_CLOUD_PAGES=1` |
| PIN inválido | Confira `MOBILE_TRIGGER_PIN` no Cloudflare |
| Trigger falha | Confira `GITHUB_TOKEN` com `actions:write` |
| Job não inicia | Veja Actions em GitHub → migrate-bulk-hyper |

## Custo

GitHub Actions free tier: ~2–6 h por corrida hyper (repo privado: 2000 min/mês).
