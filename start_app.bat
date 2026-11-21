@echo off
setlocal

cd /d "%~dp0"

echo [INFO] Starting app_v2.2 from: %CD%

if not exist ".env" (
  echo [ERROR] Missing .env file in project root.
  exit /b 1
)

if not exist "venv\Scripts\python.exe" (
  echo [ERROR] Python venv not found. Run: python -m venv venv ^&^& venv\Scripts\python.exe -m pip install -r requirements.txt aiosqlite
  exit /b 1
)

set PORT=%1
if "%PORT%"=="" set PORT=8002

echo [INFO] Using port: %PORT%
echo [INFO] Open: http://127.0.0.1:%PORT%/web/login.html

venv\Scripts\python.exe run.py %PORT%

endlocal
