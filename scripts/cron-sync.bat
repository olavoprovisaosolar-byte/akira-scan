@echo off

cd /d "%~dp0.."

node scripts\sync-toonlivre.mjs

echo Sync ToonLivre concluido. Ver logs\sync.log

