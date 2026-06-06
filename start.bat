@echo off
:: ============================================================
:: AI Opportunity Radar — One-click launcher (Windows)
:: Double-click this file to launch
:: ============================================================

title AI Opportunity Radar
cd /d "%~dp0"

echo.
echo   ^|^|  AI Opportunity Radar
echo   --------------------------------

:: Check Node
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo   X  Node.js not found.
  echo      Install from https://nodejs.org ^(LTS^) then re-run.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v') do set NODE_MAJ=%%v
set NODE_MAJ=%NODE_MAJ:v=%
if %NODE_MAJ% LSS 18 (
  echo   X  Node.js too old ^(need v18+^).
  echo      Update from https://nodejs.org
  pause
  exit /b 1
)

echo   OK  Node.js found

:: Install deps if needed
if not exist "node_modules\" (
  echo   Installing dependencies ^(first run only^)...
  call npm install --silent
  echo   OK  Dependencies installed
)

:: Create .env if missing
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo   OK  Created .env
  )
)

echo.
echo   Starting dev server...
echo   URL ^-^> http://localhost:4321/ai-opportunity-radar
echo.
echo   Press Ctrl+C to stop.
echo.

:: Open browser after 3 seconds
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4321/ai-opportunity-radar"

call npm run dev
pause
