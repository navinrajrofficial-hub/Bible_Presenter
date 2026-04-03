@echo off
setlocal

REM Edit these paths to your whisper.cpp installation.
set WHISPER_CPP_DIR=C:\tools\whisper.cpp
set WHISPER_SERVER_EXE=%WHISPER_CPP_DIR%\build\bin\Release\whisper-server.exe
set WHISPER_MODEL=%WHISPER_CPP_DIR%\models\ggml-medium.bin

if not exist "%WHISPER_SERVER_EXE%" (
  echo whisper-server.exe not found at:
  echo %WHISPER_SERVER_EXE%
  echo.
  echo Update WHISPER_SERVER_EXE in this file.
  pause
  exit /b 1
)

if not exist "%WHISPER_MODEL%" (
  echo Model file not found at:
  echo %WHISPER_MODEL%
  echo.
  echo Download a model and update WHISPER_MODEL in this file.
  pause
  exit /b 1
)

cd /d "%WHISPER_CPP_DIR%"
echo Starting local ASR server on http://127.0.0.1:8765
"%WHISPER_SERVER_EXE%" -m "%WHISPER_MODEL%" -l ta -host 127.0.0.1 -port 8765

endlocal
