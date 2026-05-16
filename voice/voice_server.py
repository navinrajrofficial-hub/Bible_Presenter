import json
import os
import tempfile
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WHISPER_BIN = os.path.join(BASE_DIR, "whisper.cpp", "main.exe")
MODEL_PATH = os.path.join(BASE_DIR, "models", "ggml-base.bin")
TMP_DIR = os.path.join(BASE_DIR, "tmp")
LANGUAGE = "ta"

os.makedirs(TMP_DIR, exist_ok=True)


def _set_headers(handler, status=200, content_type="application/json"):
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()


class VoiceHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        _set_headers(self, 204)

    def do_GET(self):
        if self.path.startswith("/transcribe"):
            _set_headers(self, 200, "text/plain")
            self.wfile.write(b"ok")
            return
        _set_headers(self, 404, "text/plain")
        self.wfile.write(b"not found")

    def do_POST(self):
        if self.path != "/transcribe":
            _set_headers(self, 404, "text/plain")
            self.wfile.write(b"not found")
            return

        if not os.path.isfile(WHISPER_BIN):
            _set_headers(self, 500, "text/plain")
            self.wfile.write(b"whisper binary not found")
            return
        if not os.path.isfile(MODEL_PATH):
            _set_headers(self, 500, "text/plain")
            self.wfile.write(b"model not found")
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            _set_headers(self, 400, "text/plain")
            self.wfile.write(b"empty body")
            return

        raw = self.rfile.read(length)
        if not raw:
            _set_headers(self, 400, "text/plain")
            self.wfile.write(b"empty body")
            return

        with tempfile.NamedTemporaryFile(delete=False, dir=TMP_DIR, suffix=".wav") as f:
            wav_path = f.name
            f.write(raw)

        out_prefix = wav_path + "_out"
        cmd = [
            WHISPER_BIN,
            "-m", MODEL_PATH,
            "-f", wav_path,
            "-otxt",
            "-of", out_prefix,
            "-l", LANGUAGE,
            "-q"
        ]

        text = ""
        try:
            print("Running whisper.cpp on temp wav...")
            result = subprocess.run(cmd, check=False, timeout=30, capture_output=True, text=True)
            if result.returncode != 0:
                print("Whisper Error:", result.stderr)
            txt_path = out_prefix + ".txt"
            if os.path.isfile(txt_path):
                with open(txt_path, "r", encoding="utf-8", errors="ignore") as t:
                    text = t.read().strip()
            print("Transcript:", text)
        except Exception as e:
            print("Exception running whisper:", e)
            text = ""
        finally:
            for p in (wav_path, out_prefix + ".txt"):
                try:
                    if os.path.isfile(p):
                        os.remove(p)
                except Exception:
                    pass

        _set_headers(self, 200)
        self.wfile.write(json.dumps({"text": text}).encode("utf-8"))


def main():
    server = HTTPServer(("127.0.0.1", 8123), VoiceHandler)
    print("Voice server listening on http://127.0.0.1:8123")
    server.serve_forever()


if __name__ == "__main__":
    main()
