Voice Control (Offline)

This feature uses whisper.cpp locally to transcribe short audio chunks.

Setup
1) Download whisper.cpp prebuilt binaries for Windows.
   Place main.exe in: voice/whisper.cpp/

2) Download a model file.
   Recommended: ggml-base.bin
   Place it in: voice/models/

3) Start the local server:
   start_voice_control.bat

Notes
- This server listens on http://127.0.0.1:8123
- The UI button "Voice" will send short WAV chunks to this server.
- No internet is required after downloading the model and binary.
