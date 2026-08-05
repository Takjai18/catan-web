@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Catan - 卡坦島

echo.
echo  ========================================
echo    卡坦島 Catan - USB Portable
echo  ========================================
echo.
echo  Opening game in your default browser...
echo  (No install needed. Close this window anytime.)
echo.

REM Prefer single-file index.html (works offline, double-click friendly)
if exist "%~dp0index.html" (
  start "" "%~dp0index.html"
  goto :done
)

echo  ERROR: index.html not found.
pause
exit /b 1

:done
echo  Game launched. You can close this window.
timeout /t 4 >nul
exit /b 0
