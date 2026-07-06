# Backup completo ToonLivre → AkiraScan

Script principal: `scripts/backup-toonlivre-complete.mjs`

## O que baixa

Para **cada obra** do catálogo ToonLivre (661+ títulos, ~69.000 capítulos):

| Item | Destino |
|------|---------|
| Metadados | `data/toonlivre-backup/obras/{id}/metadados.json` |
| Capa | `.../capa.webp` |
| Capítulos | `.../capitulos/capitulo-035/pagina-001.webp` |
| Espelho import | `data/toonlivre-backup/mangas/{id}/chapters/{capId}/pages/` |
| Biblioteca local | `Biblioteca_Mangas/{id}/{capId}/` |

## Comandos

```bash
# Backup completo com retomada automática
npm run backup:complete

# Reiniciar do zero
node scripts/backup-toonlivre-complete.mjs --fresh

# Testar uma obra
node scripts/backup-toonlivre-complete.mjs --manga=obra-69466adb

# Testar 3 obras
node scripts/backup-toonlivre-complete.mjs --limit=3

# Após concluir (ou parcialmente)
npm run rebuild:backup
```

## Retomada

Estado em `data/toonlivre-backup/complete-state.json`.  
Arquivos já baixados **não são repetidos** (verifica tamanho > 200 bytes).

## Relatório final

`data/toonlivre-backup/complete-report.json`:

- Total de obras processadas
- Total de capítulos baixados / falhas
- Total de páginas
- Lista de falhas
- Confirmação de prontidão para import

## Requisitos

```bash
npx playwright install chromium
```

O download de **páginas** usa Playwright (navegador real) porque a API ToonLivre bloqueia requisições server-side.

## Tempo estimado

~69.000 capítulos × ~0,6 s ≈ **12–48 horas** (depende da rede e do ToonLivre).  
Execute em terminal persistente ou `nohup`:

```bash
node scripts/backup-toonlivre-complete.mjs 2>&1 | tee logs/backup-complete-run.log
```
