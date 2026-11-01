@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

rem Find a Python: prefer a sibling .venv (any folder next to this repo), then PATH.
set "PY="
for /d %%d in ("..\*") do (
  if exist "%%~fd\.venv\Scripts\python.exe" set "PY=%%~fd\.venv\Scripts\python.exe"
)
if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  where py >nul 2>&1 && set "PY=py"
)

if not defined PY (
  echo [ERROR] Python not found. Install Python 3 and try again.
  pause
  exit /b 1
)

echo Using: %PY%
"%PY%" "tools\serve.py" --open
echo.
pause
