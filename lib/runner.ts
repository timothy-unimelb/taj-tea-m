// Client for the Cloudflare Python runner (runner/README.md). Server only:
// needs RUNNER_URL and RUNNER_TOKEN in the env. Nothing in the app calls it yet.

export type RunStatus = {
  run_id: string;
  job: string;
  params: Record<string, string>;
  state: "queued" | "running" | "succeeded" | "failed";
  outputs?: string[];
  error?: string | null;
};

async function call(path: string, init?: RequestInit) {
  const base = process.env.RUNNER_URL;
  if (!base || !process.env.RUNNER_TOKEN) throw new Error("RUNNER_URL and RUNNER_TOKEN must be set");
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RUNNER_TOKEN}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Runner answered ${response.status} for ${path}`);
  return response;
}

/** Start a job, or get the cached run of an identical earlier request. */
export async function startRun(job: string, params: Record<string, string> = {}, force = false) {
  const response = await call(`/jobs/${encodeURIComponent(job)}/runs`, {
    method: "POST",
    body: JSON.stringify({ params, force }),
  });
  return (await response.json()) as { run_id: string; cached: boolean };
}

export async function getRun(runId: string) {
  return (await (await call(`/runs/${encodeURIComponent(runId)}`)).json()) as RunStatus;
}

/** One output file of a finished run, by the path listed in RunStatus.outputs. */
export async function getRunFile(runId: string, path: string) {
  return call(`/runs/${encodeURIComponent(runId)}/files/${path.split("/").map(encodeURIComponent).join("/")}`);
}
