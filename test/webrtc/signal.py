#!/usr/bin/env python3
# Minimal LAN WebRTC signaling relay + static server for the Atlas receive-path test.
# Runs on the laptop. Chrome (caller) sends a 440Hz tone; TouchPad Atlas (callee) receives + plays it.
# Non-trickle ICE: each side posts ONE full SDP (offer/answer, candidates already embedded), the other polls.
# No deps (stdlib only). Serves call.html from its own directory.
import http.server, socketserver, os, json, threading, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8080"))
BOX = {}                 # {(room,key): sdp-json-string}
LOCK = threading.Lock()

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/get":
            q = urllib.parse.parse_qs(u.query)
            room = q.get("room", ["atlas"])[0]; key = q.get("key", [""])[0]
            with LOCK:
                v = BOX.get((room, key), "")
            body = v.encode()
            self.send_response(200); self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body); return
        if u.path == "/reset":
            with LOCK: BOX.clear()
            self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"ok"); return
        return super().do_GET()      # static files (call.html)
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/post":
            q = urllib.parse.parse_qs(u.query)
            room = q.get("room", ["atlas"])[0]; key = q.get("key", [""])[0]
            n = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(n).decode()
            with LOCK: BOX[(room, key)] = data
            self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"ok"); return
        self.send_response(404); self.end_headers()
    def log_message(self, *a): pass   # quiet

socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), H) as httpd:
    print(f"signaling+http server on 0.0.0.0:{PORT}  (serving {HERE})")
    print(f"  caller (Chrome, laptop):  http://localhost:{PORT}/call.html?role=caller")
    print(f"  callee (TouchPad Atlas):  http://<LAPTOP_LAN_IP>:{PORT}/call.html?role=callee")
    httpd.serve_forever()
