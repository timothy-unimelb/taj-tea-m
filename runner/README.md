# Python runner on Cloudflare

Runs the team's Python (Tamara's model, later SUMO) on demand, away from Vercel. Nothing runs while idle: each run gets its own container, which sleeps when the job ends. Inputs and results live in R2 (Cloudflare's file storage).

Status (30 Sep): built and tested locally in Docker, and `wrangler deploy --dry-run` passes. **Not deployed yet.** The app does not call it yet.

## How it works

```
Vercel app ──HTTPS + token──▶ Worker ──▶ container (one per run) ──▶ R2
    lib/runner.ts             worker/       container/runner.py       runs/<run_id>/status.json, log.txt, outputs/
                              index.ts      runs the job's steps      latest/<job>.json, cache/<key>.json
```

1. The app calls `POST /jobs/<job>/runs`. The Worker checks the token, then checks R2 for an identical earlier run (same job, same params, same deployed code). If there is one, it answers with that run straight away.
2. Otherwise it writes `status.json` as `queued`, starts a new container and hands it the job. It answers `202` with a `run_id` at once.
3. The container downloads the job's inputs from R2, runs its steps in order, uploads its outputs, and writes `status.json` as `succeeded` or `failed`, along with `log.txt`.
4. The app polls `GET /runs/<run_id>` and reads files with `GET /runs/<run_id>/files/<path>`.
5. Cloudflare puts a container to sleep after 2 minutes without requests. A job can run longer than that with nobody polling, so before it sleeps the Worker asks the container whether a job is still running and keeps it up if so. Each job's `timeout_s` ends a stuck run.

## Swapping inputs, outputs and scripts

Everything a job does is in [jobs.json](jobs.json). Adding or changing a job needs no code changes.

```jsonc
"mvm-build": {
  "inputs":  [{ "r2": "inputs/closure_site_hour.parquet", "to": "model/data/closure_site_hour.parquet", "optional": true }],
  "steps":   [["python", "model/mvm/build_mvm.py"], ["python", "model/export_app_tables.py"]],
  "outputs": ["model/mvm/output/*.csv", "data/impact/mvm-tables.json"],
  "timeout_s": 600,
  "cache": true
}
```

- **inputs**: R2 files copied to a repo-relative path before the steps run. An `optional` input falls back to the copy built into the image. So to try a new parquet, upload it to R2 without redeploying: `npx wrangler r2 object put barrier-brain-runs/inputs/closure_site_hour.parquet --file <path> --remote`.
- **steps**: commands run in order from the repo root, each a list of arguments (never a shell). `{name}` is filled from the request's `params`, for example `["python", "model/sumo/04_run.py", "--site", "{site}"]`. Params may only hold letters, digits and `_ . : -`.
- **outputs**: file patterns uploaded after the steps succeed.
- **image.include**: the repo files built into the image. `npm run stage` copies only these into `build/`. The repo has 18 GB of SUMO work files that must stay out.

Changing a Python file or `image.include` needs a redeploy (`npm run deploy`). Changing only R2 inputs does not.

## Memory

`build_mvm.py` finishes in 8 seconds but peaks at **9.6 GB**, because it loads all 52 columns of the 4.8 million row parquet. Many of them are long text repeated on every row. So the container uses `standard-4` (12 GiB). The limit is a hard cap: a job that goes over is killed and marked failed, and nothing else is affected.

If `build_mvm.py` read only the columns it uses, the peak would drop to 3.7 GB with identical outputs (tested on a copy). That is Tamara's call, since it is her file. Even then `standard-1` (4 GiB) would be tight, so change `instance_type` only after measuring.

Docker Desktop on this Mac has 1.9 GB, so `mvm-build` cannot run in local Docker. Everything else does.

## Setting it up (not done yet)

Needs the Cloudflare account that has the Workers Paid plan, and Docker running (Wrangler builds the image).

```bash
cd runner && npm install
npx wrangler login
npm run bucket     # R2 bucket barrier-brain-runs, with runs/ deleted after 90 days
```

Create an R2 API token in the Cloudflare dashboard (R2 > Manage API tokens), with Object Read & Write on `barrier-brain-runs` only. The container uses it to read inputs and write results. Then:

```bash
npm run secrets    # RUNNER_TOKEN (make one: openssl rand -hex 32), then the R2 token's access key id and secret
npm run deploy
```

In Vercel, set `RUNNER_URL` (the `workers.dev` address the deploy prints) and `RUNNER_TOKEN`. Check it:

```bash
curl -H "Authorization: Bearer $RUNNER_TOKEN" "$RUNNER_URL/jobs"
curl -X POST -H "Authorization: Bearer $RUNNER_TOKEN" "$RUNNER_URL/jobs/mvm-sample/runs"
```

`R2_ACCOUNT_ID` in `wrangler.jsonc` is the account from the taboo repo. Change it if this project uses another account.

## Testing locally

```bash
npm run local                                  # builds the image, serves it on :8080, storage in runner/.local-r2/
curl -X POST localhost:8080/run -d '{"run_id":"t1","job":"mvm-sample"}'
cat .local-r2/runs/t1/log.txt
npm run check                                  # type check the Worker
```

`python container/runner.py <job>` also works without Docker, using the repo as the work folder. Be careful: that writes the job's outputs into the repo.

## Cost

Containers are billed only while running: memory, CPU and disk by the second, beyond what the Workers Paid plan includes. An 8-second `build_mvm` run plus 2 minutes of idle before sleep is a fraction of a cent. R2 has 10 GB of free storage and no download fees.

## Next

1. Deploy (steps above) and run `mvm-sample` from Vercel.
2. SUMO: uncomment the `apt-get install sumo` line in the Dockerfile, add `model/sumo/*.py` and the network to `image.include`, and add a job per scenario. `04_run.py` keeps its own 3 GB and 20 minute caps.
3. If a job ever needs retries or several containers in sequence, put a Cloudflare Workflow in front of it (the taboo repo's `d1-backup-worker` shows the pattern).
