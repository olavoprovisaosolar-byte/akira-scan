# Worker no celular — velocidade máxima (nuvem)

No **celular não dá** para rodar Playwright/Chromium (NexusToons + Turnstile). O que funciona: **disparar a migração hyper na nuvem** com um toque — **0 RAM no telefone**, velocidade máxima nos servidores GitHub (~7 GB RAM).

## Setup (uma vez)

1. **Cloudflare Pages** → projeto `akira-scan` → **Settings → Environment variables** (Production):

| Nome | Tipo | Valor |
|------|------|-------|
| `MOBILE_TRIGGER_PIN` | Secret | PIN forte (ex: 6–8 dígitos que só você sabe) |
| `GITHUB_TOKEN` | Secret | PAT GitHub com escopo `repo` + `actions:write` |

2. Deploy do site:
```powershell
npm run deploy:cloudflare
```

## Usar no celular

1. Abra no browser:
   ```
   https://akira-scan.pages.dev/mobile/
   ```

2. Digite o **PIN** (`MOBILE_TRIGGER_PIN`)

3. Toque em **🚀 Iniciar HYPER** — dispara GitHub Actions com:
   - 3 mangás paralelos
   - Telegra.ph primário
   - Checkpoint git a cada 15 min

4. Acompanhe em **Ver logs no GitHub**

### Atalho com PIN na URL (bookmark)

Salve nos favoritos do celular:
```
https://akira-scan.pages.dev/mobile/?pin=SEU_PIN
```

## O que NÃO roda no celular

| Tentativa | Por quê |
|-----------|---------|
| Node + Playwright no Termux | Sem Chromium/Turnstile estável, RAM insuficiente |
| App nativo | Mesmo limite — captura exige browser desktop |

## Alternativas por velocidade

| Onde | Comando / ação | RAM local |
|------|----------------|-----------|
| **Celular** | `/mobile/` → HYPER | 0 |
| **GitHub Actions** | Workflow manual | 0 |
| **Segundo PC** | `npm run migrate:remote:telegra` | ~2 GB |
| **PC principal hyper** | `npm run migrate:bulk:all:hyper` | ~4–8 GB |

## API (opcional)

```http
GET /api/mobile/status
POST /api/mobile/trigger
Header: X-Mobile-Pin: SEU_PIN
Body: {"mode":"hyper","deploy":true}
```

## Custo

GitHub Actions free tier: ~2–6 h por corrida hyper (repo privado: 2000 min/mês).
