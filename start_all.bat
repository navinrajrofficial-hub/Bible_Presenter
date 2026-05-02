@echo off
setlocal
cd /d "%~dp0"

echo Starting Bible Presenter + Remote Control...

call start_localhost.bat
call start_remote_control.bat

echo.
echo Both servers started.
endlocal
