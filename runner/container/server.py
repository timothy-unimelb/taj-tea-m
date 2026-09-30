"""HTTP front of the container. Only the Worker talks to it.

    POST /run     {"run_id", "job", "params", "cache_key"}  starts the job in the background, answers 202
    GET  /status  {"busy": bool, "run_id": ...}             the Worker asks this before letting the container sleep

One job at a time: the Worker gives each run its own container, so a second /run is refused."""
import json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from runner import run_job

current = {"run_id": None}
lock = threading.Lock()


def work(body):
    try:
        run_job(body["job"], body.get("params") or {}, body["run_id"], body.get("cache_key"))
    finally:
        with lock:
            current["run_id"] = None


class Handler(BaseHTTPRequestHandler):
    def send(self, code, value):
        data = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/status":
            return self.send(200, {"busy": current["run_id"] is not None, "run_id": current["run_id"]})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/run":
            return self.send(404, {"error": "not found"})
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        with lock:
            if current["run_id"]:
                return self.send(409, {"error": "busy", "run_id": current["run_id"]})
            current["run_id"] = body["run_id"]
        threading.Thread(target=work, args=(body,), daemon=True).start()
        self.send(202, {"run_id": body["run_id"]})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
