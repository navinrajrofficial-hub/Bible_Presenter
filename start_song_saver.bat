@echo off
cd /d "%~dp0"
echo Compiling SongSaver.java...
javac SongSaver.java
if errorlevel 1 (
    echo.
    echo ERROR: Compilation failed. Make sure Java JDK is installed.
    pause
    exit /b 1
)
echo.
echo Starting SongSaver server...
java SongSaver
pause
