// The written severity rule. Every model's result is rated here, so ratings
// mean the same thing whichever model produced the numbers.
// The rule is also written out in model/IMPACT_CONTRACT.md. Keep the two in step.
//
// 1. A modelled mode is rated on the high end of each range (the worst case):
//    High      forced diversions >= 1,000 vehicles, or max queue >= 250 m, or delay >= 200 vehicle-hours
//    Moderate  forced diversions >= 100 vehicles, or max queue >= 50 m, or delay >= 20 vehicle-hours
//    Low       below all of those
//    For pedestrians, detour >= 100 m is High and >= 30 m is Moderate.
//    For trams and buses, any diverted service is High.
// 2. A mode the model does not cover is "Review required" when the plan touches it
//    (a tram street, pedestrians moved off the footpath, trucks on a detour).
//    Otherwise it is "Not modelled". It never gets a made-up rating.
// 3. Overall is the highest mode rating. "Review required" counts as Moderate.
// The thresholds are a first cut by the team, to be checked with RPM Hire.

import type { ImpactRequest, ImpactResult, ModeId, ModeImpact, Range, Severity } from "./types";

const LIMITS = {
  forced_diversions: { high: 1000, moderate: 100, label: "forced diversions", unit: "vehicles" },
  max_queue: { high: 250, moderate: 50, label: "max queue", unit: "m" },
  delay: { high: 200, moderate: 20, label: "delay", unit: "vehicle-hours" },
  detour: { high: 100, moderate: 30, label: "detour", unit: "m" },
} as const;

type MetricKey = keyof typeof LIMITS;
const MODE_METRICS: Record<ModeId, MetricKey[]> = {
  cars: ["forced_diversions", "max_queue", "delay"],
  trucks: ["forced_diversions", "max_queue", "delay"],
  public_transport: ["delay"],
  pedestrians: ["detour"],
};

const RANK: Record<Severity, number> = { "Not modelled": 0, Low: 1, Moderate: 2, "Review required": 2, High: 3 };
const fmt = (n: number) => Math.round(n).toLocaleString("en-AU");

function rateModelled(mode: ModeId, impact: ModeImpact): { severity: Severity; reason: string } {
  if (mode === "public_transport" && (impact.forced_diversions?.high ?? 0) > 0)
    return { severity: "High", reason: "Services may be diverted." };
  let best: { severity: Severity; reason: string } = { severity: "Low", reason: "All results are below the Moderate limits." };
  for (const key of MODE_METRICS[mode]) {
    const range = impact[key] as Range | undefined;
    if (!range) continue;
    const limit = LIMITS[key];
    const level: Severity = range.high >= limit.high ? "High" : range.high >= limit.moderate ? "Moderate" : "Low";
    if (RANK[level] > RANK[best.severity])
      best = { severity: level, reason: `Worst-case ${limit.label}: ${fmt(range.high)} ${range.unit}. The ${level} limit is ${fmt(level === "High" ? limit.high : limit.moderate)} ${limit.unit}.` };
  }
  return best;
}

function planTouches(mode: ModeId, request: ImpactRequest): string | null {
  if (mode === "public_transport" && request.site.tram_route)
    return `Trams run on ${request.site.street}. The works sit beside the tracks, so Yarra Trams must review the plan.`;
  if (mode === "pedestrians" && request.pedestrian_management.length > 0)
    return "The plan moves pedestrians off their usual path. Check the route on site.";
  if (mode === "trucks" && request.closure_type === "road closed")
    return "The road is closed. Check the detour suits trucks.";
  return null;
}

export function rateSeverity(result: ImpactResult, request: ImpactRequest): ImpactResult {
  const modes = { ...result.modes };
  for (const id of Object.keys(modes) as ModeId[]) {
    const impact = modes[id];
    const touched = planTouches(id, request);
    const rated = impact.status === "modelled" ? rateModelled(id, impact)
      : touched ? { severity: "Review required" as Severity, reason: touched }
      : { severity: "Not modelled" as Severity, reason: "This model does not cover this mode, and the plan does not clearly affect it." };
    modes[id] = { ...impact, severity: rated.severity, severity_reason: rated.reason };
  }
  const top = (Object.keys(modes) as ModeId[]).reduce((a, b) => RANK[modes[b].severity!] > RANK[modes[a].severity!] ? b : a);
  const topSeverity = modes[top].severity!;
  const overall: Severity = topSeverity === "Review required" ? "Moderate" : topSeverity;
  return { ...result, modes, overall: { severity: overall, reason: `${MODE_NAMES[top]}: ${modes[top].severity_reason}` } };
}

export const MODE_NAMES: Record<ModeId, string> = {
  cars: "Cars", pedestrians: "Pedestrians", public_transport: "Trams and buses", trucks: "Trucks",
};
