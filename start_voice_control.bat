@echo off
cd /d "%~dp0"
py -3 voice\voice_server.py
if errorlevel 1 (
	echo.
	echo Python not found. Install Python 3 and check "Add to PATH", then run again.
)
pause
