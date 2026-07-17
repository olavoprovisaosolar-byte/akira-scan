# Worker remoto — segundo PC (NexusToons → Telegra)

Use um **outro computador** para baixar capítulos do NexusToons e enviar para **Telegra.ph**, sincronizando progresso via **GitHub** (`state.json`, `chapters-index.json`).

## Requisitos no segundo PC

- **Node.js 20+**
- **Git** com acesso push ao repo `olavoprovisaosolar-byte/akira-scan`
- **Chrome** ou Chromium (Playwright instala automaticamente)
- **~2 GB RAM livre** (modo lite) ou **~4–8 GB** (modo turbo)

## Setup (uma vez)

```powershell
git clone https://github.com/olavoprovisaosolar-byte/akira-scan.git
cd akira-scan
npm run migrate:remote:setup
copy .env.remote-worker.example .env
# Edite .env — GIT_AUTHOR_EMAIL e REMOTE_WORKER_NAME
```

## Rodar migração Telegra

**Importante:** pare a migração no PC principal antes (evita conflito de lock):

```powershell
# No PC principal (se estiver rodando):
Stop-Process -Id (Get-Content logs\migration-all.lock | ConvertFrom-Json).pid -ErrorAction SilentlyContinue
npm run migrate:handoff:cloud -- --push
```

**No segundo PC:**

```powershell
cd akira-scan
git pull
npm run migrate:remote:telegra
```

### Modo mais rápido (PC potente)

```powershell
npm run migrate:remote:telegra:turbo
```

### Um mangá só

```powershell
npm run migrate:remote:telegra -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro
```

## Sync manual

```powershell
npm run migrate:remote:pull    # trazer progresso do GitHub
npm run migrate:remote:push    # enviar checkpoint
```

## O que o worker faz

1. `git pull` — pega `state.json` atualizado
2. NexusToons capture (Playwright) → URLs `.avif`
3. Upload **Telegra.ph** (fallback cloud-static se HTTP 400)
4. Atualiza `state.json`, `chapters-index.json`, `catalogo.json`
5. A cada **15 min**: commit + `git push` checkpoint
6. No fim: push final + `clean-ghost-chapters`

## Monitorar

```powershell
Get-Content logs\migration-all.log -Tail 40 -Wait
```

## Fluxo entre dois PCs

```
PC A (parado)  ←── git push/pull ──→  PC B (worker rodando)
                      │
                      ▼
              state.json no GitHub
                      │
                      ▼
         Site lê chapters-index via API
```

Nunca rode `migrate:bulk:all` nos **dois PCs ao mesmo tempo**. Use sempre pull antes de iniciar no PC B.

## Comandos npm

| Comando | Descrição |
|---------|-----------|
| `migrate:remote:setup` | npm ci + Playwright + .env |
| `migrate:remote:telegra` | Lite + Telegra + sync git |
| `migrate:remote:telegra:turbo` | Turbo + Telegra + sync git |
| `migrate:remote:pull` | git pull checkpoint |
| `migrate:remote:push` | git push checkpoint |
