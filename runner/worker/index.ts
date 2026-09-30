// Front door for the Python runner. Vercel calls this Worker, the Worker gives
// each run its own container (scale to zero), and results land in R2.
//
//   GET  /jobs                     the jobs in jobs.json
//   POST /jobs/:job/runs           {"params": {...}, "force": false} -> 202 {run_id} (or 200 with a cached run)
//   GET  /jobs/:job/latest         the newest successful run of a job
//   GET  /runs/:run_id             status.json (state: queued | running | succeeded | failed)
//   GET  /runs/:run_id/log         log.txt
//   GET  /runs/:run_id/files/<p>   one output file, <p> as listed in status.outputs
//   GET  /runs/:run_id/container   the run's container: running or not, and its last error
//
// Every request needs "Authorization: Bearer <RUNNER_TOKEN>".

import { Container } from "@cloudflare/containers";
import config from "../jobs.json";

type Env = {
  JOB_CONTAINER: DurableObjectNamespace<JobContainer>;
  RUNS: R2Bucket;
  RUNNER_TOKEN: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  CODE_VERSION?: string;
};

const jobs = config.jobs as Record<string, { description: string; cache?: boolean }>;

export class JobContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "1m";
  envVars = {
    RUNNER_STORAGE: "r2",
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_BUCKET_NAME: this.env.R2_BUCKET_NAME,
  };

  // Idle means "no requests", not "no work": a job can run for minutes with
  // nobody polling. Stay up while the runner says it is busy; returning
  // without stop() renews the timer. The runner's own timeout_s ends a stuck job.
  // destroy() kills at once: a container we pay for must never outlive its job.
  override async onActivityExpired() {
    const live = await this.liveStatus();
    if (live?.busy) return;
    await this.destroy();
  }

  // The container's own /status, or null when it is not running.
  // containerFetch would start a stopped container again, so only ask a live one.
  async liveStatus() {
    const { status } = await this.getState();
    if (status !== "running" && status !== "healthy") return null;
    try {
      return (await (await this.containerFetch("http://container/status")).json()) as {
        busy: boolean;
        run_id: string | null;
        last_error: string | null;
      };
    } catch {
      return null;
    }
  }
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function authorised(request: Request, env: Env) {
  const got = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
  const want = new TextEncoder().encode(`Bearer ${env.RUNNER_TOKEN}`);
  return !!env.RUNNER_TOKEN && got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function r2Response(env: Env, key: string, contentType?: string) {
  const object = await env.RUNS.get(key);
  if (!object) return json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": contentType ?? object.httpMetadata?.contentType ?? "application/octet-stream" },
  });
}

async function startRun(env: Env, job: string, params: Record<string, string>, force: boolean) {
  // Same job definition + params + deployed code = same answer, so reuse it.
  const cacheKey = await sha256(JSON.stringify({ job: jobs[job], params, version: env.CODE_VERSION ?? "dev" }));
  if (jobs[job].cache && !force) {
    const hit = await env.RUNS.get(`cache/${cacheKey}.json`);
    if (hit) return json({ ...(await hit.json<{ run_id: string }>()), cached: true });
  }

  const runId = `${job}-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}-${crypto.randomUUID().slice(0, 6)}`;
  await env.RUNS.put(`runs/${runId}/status.json`, JSON.stringify({ run_id: runId, job, params, state: "queued" }), {
    httpMetadata: { contentType: "application/json" },
  });
  const container = env.JOB_CONTAINER.getByName(runId);
  const answer = await container.fetch(
    new Request("http://container/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId, job, params, cache_key: cacheKey }),
    }),
  );
  if (answer.status !== 202) return json({ error: `container answered ${answer.status}`, run_id: runId }, 502);
  return json({ run_id: runId, cached: false }, 202);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await authorised(request, env))) return json({ error: "unauthorised" }, 401);
    const parts = new URL(request.url).pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (request.method === "GET" && parts.length === 1 && parts[0] === "jobs") {
      return json(Object.fromEntries(Object.entries(jobs).map(([name, j]) => [name, j.description])));
    }

    if (parts[0] === "jobs" && parts[1] && !(parts[1] in jobs)) return json({ error: `no job ${parts[1]}` }, 404);

    if (request.method === "POST" && parts.length === 3 && parts[0] === "jobs" && parts[2] === "runs") {
      const body = (await request.json().catch(() => ({}))) as { params?: Record<string, string>; force?: boolean };
      return startRun(env, parts[1], body.params ?? {}, !!body.force);
    }

    if (request.method === "GET" && parts.length === 3 && parts[0] === "jobs" && parts[2] === "latest") {
      return r2Response(env, `latest/${parts[1]}.json`, "application/json");
    }

    if (request.method === "GET" && parts[0] === "runs" && parts[1]) {
      const prefix = `runs/${parts[1]}`;
      if (parts.length === 2) return r2Response(env, `${prefix}/status.json`, "application/json");
      if (parts.length === 3 && parts[2] === "container") {
        const container = env.JOB_CONTAINER.getByName(parts[1]);
        return json({ state: (await container.getState()).status, status: await container.liveStatus() });
      }
      if (parts.length === 3 && parts[2] === "log") return r2Response(env, `${prefix}/log.txt`, "text/plain");
      if (parts[2] === "files" && parts.length > 3) {
        const path = parts.slice(3).join("/");
        if (path.split("/").includes("..")) return json({ error: "bad path" }, 400);
        return r2Response(env, `${prefix}/outputs/${path}`);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
