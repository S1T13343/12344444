@echo off
rem Запуск StayBook одним процесом: сайт + API на http://localhost:3000
rem (режим розробки з автоперезавантаженням: див. README, розділ «Запуск»)
cd /d "%~dp0"
rem Якщо Node.js не встановлено в систему — беремо портативний з .tools
if exist "%~dp0.tools\node-v20.18.0-win-x64\node.exe" set "PATH=%~dp0.tools\node-v20.18.0-win-x64;%PATH%"
set "npm_config_cache=%~dp0.tools\npm-cache"

if not exist backend\node_modules (cd backend && call npm install && cd ..)
if not exist frontend\node_modules (cd frontend && call npm install && cd ..)
if not exist backend\dist\main.js (cd backend && call npm run build && cd ..)
if not exist frontend\dist\index.html (cd frontend && call npm run build && cd ..)

start "StayBook" /min cmd /k "cd backend && node --max-old-space-size=256 dist/main.js"
timeout /t 6 >nul
start http://localhost:3000
