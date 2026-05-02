@echo off
setlocal
cd /d "%~dp0"

echo Starting Bible Presenter on http://127.0.0.1:5500 ...
echo (LAN access enabled at http://<LAPTOP_IP>:5500)

where py >nul 2>nul
if %errorlevel%==0 (
  start "Bible Presenter Server" cmd /k "py -m http.server 5500 --bind 0.0.0.0"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "Bible Presenter Server" cmd /k "python -m http.server 5500 --bind 0.0.0.0"
  ) else (
    echo Python not found. Install Python 3, then run this file again.
    pause
    exit /b 1
  )
)

timeout /t 1 >nul
start "" "http://127.0.0.1:5500/index.html"

echo.
echo Server started. Keep the server window open while presenting.
echo If you close server window, microphone/session access may stop.
endlocal
