"""HTTP front of the container. Only the Worker talks to it.

    POST /run     {"run_id", "job", "params", "cache_key"}  starts the job in the background, answers 202
    GET  /status  {"busy", "run_id", "last_error"}         the Worker asks this before letting the container sleep

One job at a time: the Worker gives each run its own container, so a second /run is refused.
This process is PID 1 in the container, which Linux never stops on SIGTERM by default, so it exits itself."""
import json, os, signal, threading, time, traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from runner import JOBS_FILE, run_job

current = {"run_id": None, "last_error": None}
lock = threading.Lock()
signal.signal(signal.SIGTERM, lambda *_: os._exit(0))


def watchdog(run_id, limit_s):
    """Last resort against a paid container that never sleeps: kill the process if a job overruns."""
    time.sleep(limit_s)
    if current["run_id"] == run_id:
        print(f"watchdog: {run_id} still running after {limit_s} s, exiting", flush=True)
        os._exit(1)


def work(body):
    ok = False
    try:
        ok = run_job(body["job"], body.get("params") or {}, body["run_id"], body.get("cache_key"))["state"] == "succeeded"
    except Exception:
        current["last_error"] = traceback.format_exc()
        print(current["last_error"], flush=True)
    finally:
        with lock:
            current["run_id"] = None
    # Each run has its own container and it is billed while up, so leave as soon as the job is done.
    # A failed run stays up until sleepAfter, so GET /runs/<id>/container can still show last_error.
    if ok:
        os._exit(0)


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
            return self.send(200, {"busy": current["run_id"] is not None, **current})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/run":
            return self.send(404, {"error": "not found"})
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        with lock:
            if current["run_id"]:
                return self.send(409, {"error": "busy", "run_id": current["run_id"]})
            current["run_id"] = body["run_id"]
        timeout_s = json.loads(JOBS_FILE.read_text())["jobs"].get(body.get("job"), {}).get("timeout_s", 600)
        threading.Thread(target=work, args=(body,), daemon=True).start()
        threading.Thread(target=watchdog, args=(body["run_id"], timeout_s + 300), daemon=True).start()
        self.send(202, {"run_id": body["run_id"]})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
