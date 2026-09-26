@echo off
setlocal
cd /d "%~dp0\frontend"

echo ===================================================
echo   Starting Angular Bible Presenter (Development)
echo   நல்ல சமாரியன் இயேசு ஜெப வீடு
echo ===================================================
echo.

start "Angular Bible Presenter" cmd /k "npm start"

timeout /t 3 >nul
start "" "http://localhost:4200"

echo Angular app launching on http://localhost:4200
endlocal
