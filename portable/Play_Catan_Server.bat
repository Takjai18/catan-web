@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Catan Server

echo.
echo  Starting local server (optional mode)...
echo  Browser will open http://localhost:8765/
echo  Press Ctrl+C in this window to stop the server.
echo.

REM Try Python launchers common on Windows
where py >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:8765/
  py -m http.server 8765
  goto :eof
)

where python >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:8765/
  python -m http.server 8765
  goto :eof
)

where python3 >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:8765/
  python3 -m http.server 8765
  goto :eof
)

REM Fallback: PowerShell static server (no Python needed)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
if errorlevel 1 (
  echo.
  echo  Could not start a server. Just double-click index.html instead:
  echo    %~dp0index.html
  echo.
  pause
)
