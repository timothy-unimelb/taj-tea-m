"""Run one job from jobs.json: fetch its inputs, run its steps, upload its outputs and a status.json.

    python runner/container/runner.py mvm-build                # local: storage is runner/.local-r2/
    python runner/container/runner.py mvm-build --params '{}'  # params fill {name} placeholders in steps

Storage is R2 (through its S3 API) when R2_ACCOUNT_ID is set, otherwise a local folder (LOCAL_R2_DIR).
Everything a run writes lives under runs/<run_id>/: status.json, log.txt and outputs/<path>."""
import argparse, datetime as dt, glob, json, os, pathlib, re, subprocess, sys, time, uuid

JOBS_FILE = pathlib.Path(os.environ.get("JOBS_FILE", pathlib.Path(__file__).resolve().parents[1] / "jobs.json"))
WORK_DIR = pathlib.Path(os.environ.get("WORK_DIR", pathlib.Path(__file__).resolve().parents[2]))
PARAM_VALUE = re.compile(r"^[A-Za-z0-9_.:-]{1,100}$")   # params go into argv, never a shell, but keep them plain


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


class Storage:
    """R2 via boto3 when credentials are present, else a local folder that mimics the same keys."""

    def __init__(self):
        if os.environ.get("R2_ACCOUNT_ID"):
            import boto3
            self.bucket = os.environ["R2_BUCKET_NAME"]
            self.s3 = boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                                   aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                                   aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"], region_name="auto")
            self.root = None
        else:
            self.root = pathlib.Path(os.environ.get("LOCAL_R2_DIR", pathlib.Path(__file__).resolve().parents[1] / ".local-r2"))

    def download(self, key, dest):
        """Copy key to dest. Returns False when the key does not exist."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        if self.root:
            src = self.root / key
            if not src.exists():
                return False
            dest.write_bytes(src.read_bytes())
            return True
        from botocore.exceptions import ClientError
        try:
            self.s3.download_file(self.bucket, key, str(dest))
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            raise

    def upload(self, path, key):
        if self.root:
            (self.root / key).parent.mkdir(parents=True, exist_ok=True)
            (self.root / key).write_bytes(pathlib.Path(path).read_bytes())
        else:
            self.s3.upload_file(str(path), self.bucket, key)

    def put_json(self, key, value):
        body = json.dumps(value, indent=2).encode()
        if self.root:
            (self.root / key).parent.mkdir(parents=True, exist_ok=True)
            (self.root / key).write_bytes(body)
        else:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType="application/json")


def fill(arg, params):
    return re.sub(r"\{(\w+)\}", lambda m: params[m.group(1)], arg)


def run_job(job_name, params=None, run_id=None, cache_key=None):
    params = params or {}
    job = json.loads(JOBS_FILE.read_text())["jobs"][job_name]
    for k, v in params.items():
        if not PARAM_VALUE.match(str(v)):
            raise ValueError(f"param {k} has characters that are not allowed")
    run_id = run_id or f"{job_name}-{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}"
    store, prefix = Storage(), f"runs/{run_id}"
    status = {"run_id": run_id, "job": job_name, "params": params, "state": "running", "started_at": now(),
              "finished_at": None, "steps": [], "inputs": [], "outputs": [], "error": None}
    store.put_json(f"{prefix}/status.json", status)
    log_path = WORK_DIR / f".run-{run_id}.log"
    deadline = time.monotonic() + job.get("timeout_s", 600)

    try:
        with open(log_path, "w") as log:
            for inp in job.get("inputs", []):
                got = store.download(inp["r2"], WORK_DIR / inp["to"])
                status["inputs"].append({"r2": inp["r2"], "used": got})
                if not got and not inp.get("optional"):
                    raise RuntimeError(f"input {inp['r2']} is missing")
                log.write(f"input {inp['r2']}: {'downloaded' if got else 'not in storage, using the copy in the image'}\n")

            for step in job["steps"]:
                argv = [sys.executable if a == "python" else fill(a, params) for a in step]
                log.write(f"\n$ {' '.join(step)}\n")
                log.flush()
                t0 = time.monotonic()
                try:
                    code = subprocess.run(argv, cwd=WORK_DIR, stdout=log, stderr=subprocess.STDOUT,
                                          timeout=max(1, deadline - time.monotonic())).returncode
                except subprocess.TimeoutExpired:
                    code = "timeout"
                status["steps"].append({"cmd": step, "exit": code, "seconds": round(time.monotonic() - t0, 1)})
                if code != 0:
                    raise RuntimeError(f"step {' '.join(step)} ended with {code}")

            for pattern in job.get("outputs", []):
                for path in sorted(glob.glob(str(WORK_DIR / pattern), recursive=True)):
                    rel = pathlib.Path(path).relative_to(WORK_DIR).as_posix()
                    store.upload(path, f"{prefix}/outputs/{rel}")
                    status["outputs"].append(rel)
        status["state"] = "succeeded"
    except Exception as e:
        status["state"], status["error"] = "failed", str(e)
    finally:
        status["finished_at"] = now()
        if log_path.exists():
            store.upload(log_path, f"{prefix}/log.txt")
            log_path.unlink()
        store.put_json(f"{prefix}/status.json", status)
        if status["state"] == "succeeded":
            store.put_json(f"latest/{job_name}.json", {"run_id": run_id, "finished_at": status["finished_at"]})
            if cache_key and job.get("cache"):
                store.put_json(f"cache/{cache_key}.json", {"run_id": run_id})
    return status


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job")
    ap.add_argument("--params", default="{}", help="JSON object of step placeholders")
    a = ap.parse_args()
    result = run_job(a.job, json.loads(a.params))
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["state"] == "succeeded" else 1)
