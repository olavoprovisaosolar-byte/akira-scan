@echo off

title AkiraScan v2

cd /d "%~dp0.."



where node >nul 2>&1 || (echo Instale Node.js & pause & exit /b 1)



for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5501" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1



echo.

echo  AkiraScan v2 — reconstrucao completa

echo.



echo  [1/3] Corrigir metadados...

node scripts\seed-biblioteca.mjs



echo  [2/3] Sincronizar catalogo ToonLivre (Python preferencial)...

python sync\python\toonlivre_sync.py 2>nul || node scripts\sync-toonlivre.mjs

echo  [2b/3] Seed Firestore (se configurado)...

node scripts\seed-firestore.mjs



echo  [3/3] Iniciar API TypeScript...

echo  Abra: http://localhost:5501/index.html

echo.



set PORT=5501

set HOST=0.0.0.0

call npm run dev 2>nul || node scripts\dev-server.mjs

pause

