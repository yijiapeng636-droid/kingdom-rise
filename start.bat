@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing npm dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 pause & exit /b 1
)
call npm run dev
pause
