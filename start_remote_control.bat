@echo off
setlocal
cd /d "%~dp0"

echo Starting Remote Control Server on http://0.0.0.0:8788 ...

where py >nul 2>nul
if %errorlevel%==0 (
  start "Remote Control Server" cmd /k "py remote_control_server.py"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "Remote Control Server" cmd /k "python remote_control_server.py"
  ) else (
    echo Python not found. Install Python 3, then run this file again.
    pause
    exit /b 1
  )
)

echo.
echo Remote control server started. Keep the window open.
endlocal
