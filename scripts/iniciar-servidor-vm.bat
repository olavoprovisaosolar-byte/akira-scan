@echo off
title AkiraScan - Servidor
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
    echo Instala Node.js em https://nodejs.org
    pause
    exit /b 1
)

set PORT=80
set HOST=0.0.0.0
echo AkiraScan em http://192.168.100.23:%PORT%
echo Para parar: Ctrl+C
node scripts\dev-server.mjs
