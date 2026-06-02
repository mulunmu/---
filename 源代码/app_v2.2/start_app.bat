@echo off
setlocal

cd /d "%~dp0"

echo [INFO] Starting app_v2.2 from: %CD%

if not exist ".env" (
  echo [ERROR] Missing .env file in project root.
  exit /b 1
)

set PORT=%1
if "%PORT%"=="" set PORT=8002

echo [INFO] Using port: %PORT%
echo [INFO] Open: http://127.0.0.1:%PORT%/web/login.html

python -m uvicorn app.main:app --reload --env-file .env --host 127.0.0.1 --port %PORT%

endlocal
