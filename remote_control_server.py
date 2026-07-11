import json
import os
import socket
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Resolve the "Church Backup" folder relative to this script's location
BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
CHURCH_BACKUP   = os.path.join(BASE_DIR, "Church Backup")

COMMAND_QUEUE = []
REMOTE_STATE = {
    "bookmarks": [],
    "slides": [],
    "current": 0,
    "total": 0,
    "updatedAt": 0
}


def _send_json(handler, payload, status=200):
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(data)


def _get_local_ip():
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass

    try:
        host = socket.gethostname()
        cand = socket.gethostbyname(host)
        if cand and not cand.startswith("127."):
            return cand
    except OSError:
        pass

    return ip


class RemoteHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/ip"):
            _send_json(self, {"ip": _get_local_ip()})
            return

        if self.path.startswith("/state"):
            _send_json(self, REMOTE_STATE)
            return

        if self.path.startswith("/poll"):
            if COMMAND_QUEUE:
                cmds = COMMAND_QUEUE[:]
                COMMAND_QUEUE.clear()
                _send_json(self, {"cmds": cmds})
            else:
                _send_json(self, {"cmds": []})
            return

        if self.path.startswith("/status"):
            _send_json(self, {"ok": True, "queue": len(COMMAND_QUEUE)})
            return

        _send_json(self, {"error": "not found"}, status=404)

    def do_POST(self):
        if self.path.startswith("/state"):
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length) if length > 0 else b""
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                payload = {}

            REMOTE_STATE["bookmarks"] = payload.get("bookmarks", [])
            REMOTE_STATE["slides"] = payload.get("slides", [])
            REMOTE_STATE["current"] = int(payload.get("current", 0) or 0)
            REMOTE_STATE["total"] = int(payload.get("total", 0) or 0)
            REMOTE_STATE["updatedAt"] = int(payload.get("updatedAt", 0) or 0)
            _send_json(self, {"ok": True})
            return

        if self.path.startswith("/export"):
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length) if length > 0 else b""
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                _send_json(self, {"error": "invalid JSON"}, status=400)
                return

            filename = payload.get("filename", "")
            content  = payload.get("content", "")
            force_save = payload.get("forceSave", False)  # New parameter
            
            if not filename or not content:
                _send_json(self, {"error": "missing filename or content"}, status=400)
                return

            # Safety: keep filename flat (no path traversal)
            filename = os.path.basename(filename)
            if not filename.endswith(".prsn"):
                filename += ".prsn"

            os.makedirs(CHURCH_BACKUP, exist_ok=True)
            dest = os.path.join(CHURCH_BACKUP, filename)
            
            # Check if file exists
            if os.path.exists(dest) and not force_save:
                # Read existing file content for comparison
                try:
                    with open(dest, "r", encoding="utf-8") as f:
                        existing_content = f.read()
                    _send_json(self, {
                        "fileExists": True,
                        "filename": filename,
                        "existingContent": existing_content
                    })
                    return
                except OSError:
                    pass  # If can't read, proceed to save
            
            # Find non-conflicting filename if forceSave: file.prsn → file(1).prsn → file(2).prsn
            if force_save and os.path.exists(dest):
                base_name = filename[:-5]  # Remove .prsn
                counter = 1
                while os.path.exists(dest):
                    filename = f"{base_name}({counter}).prsn"
                    dest = os.path.join(CHURCH_BACKUP, filename)
                    counter += 1
            
            # Save the file
            try:
                with open(dest, "w", encoding="utf-8") as f:
                    f.write(content)
                _send_json(self, {"ok": True, "saved": dest, "filename": filename})
            except OSError as e:
                _send_json(self, {"error": str(e)}, status=500)
            return

        if not self.path.startswith("/cmd"):
            _send_json(self, {"error": "not found"}, status=404)
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}

        cmd = payload.get("cmd")
        arg = payload.get("arg")
        if not cmd:
            _send_json(self, {"error": "missing cmd"}, status=400)
            return

        COMMAND_QUEUE.append({"cmd": str(cmd), "arg": arg})
        _send_json(self, {"ok": True})


def main():
    host = "0.0.0.0"
    port = 8788
    server = ThreadingHTTPServer((host, port), RemoteHandler)
    print(f"Remote control server running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
