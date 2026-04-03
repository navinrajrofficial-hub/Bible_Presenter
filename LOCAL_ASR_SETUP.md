# Local ASR Setup (Windows, EXE-style)

This project now uses local speech server only (offline runtime).

Default local ASR base URL used by the app:
- http://127.0.0.1:8765

The app tries these endpoints in order:
1. /inference
2. /transcribe
3. /asr

## Option A: whisper.cpp server (recommended)

1. Download/build whisper.cpp for Windows.
2. Download a multilingual model (for Tamil) into whisper.cpp models folder.
3. Start whisper.cpp HTTP server bound to localhost only.

Example server command:

```bat
whisper-server.exe -m models\ggml-medium.bin -l ta -host 127.0.0.1 -port 8765
```

If your binary name/path differs, edit the bat file provided in this repo:
- start_local_asr_whispercpp.bat

## Start order

1. Start local ASR server (EXE/server)
2. Start presenter app (localhost recommended)
3. Click Listen in Bible panel

## Change local server URL

Open browser console and run:

```js
bpSetLocalAsrBaseUrl('http://127.0.0.1:8765')
```

Verify current setting:

```js
bpGetLocalAsrBaseUrl()
```

Reset to default:

```js
bpSetLocalAsrBaseUrl('')
```

## Troubleshooting

1. If status says local server unavailable, confirm the ASR EXE is running.
2. If using file:// mode, use localhost serving instead:
   - python -m http.server 5500
3. If CORS errors occur, configure your local ASR server to allow requests from localhost.
4. If endpoint differs, set custom base URL via bpSetLocalAsrBaseUrl(...).

## Notes

- Listen mode is strict offline-only via local ASR service.
- Browser SpeechRecognition and CDN Whisper model loading are removed from the listen path.
