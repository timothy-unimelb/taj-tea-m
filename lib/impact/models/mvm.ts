// Plug-in: Tamara's lookup and queue model, ported to TypeScript so it runs live.
// Core maths in mvm-core.ts. This file maps the ImpactRequest onto it and writes
// the result in the shared ImpactResult shape.

import tables from "@/data/impact/mvm-tables.json";
import type { ImpactModel, ImpactRequest, ImpactResult, ModeImpact, Range } from "../types";
import { predict, roadClassFromVolume, WINDOWS, type MvmTables, type ScenarioSummary, type Window } from "./mvm-core";

const T = tables as unknown as MvmTables;
const DEFAULT_DAILY = 20000;       // used when no signal site matches the street
const CLOSED_STREET_SHARE = 0.5;   // share of the intersection count on the closed street
const WINDOW_LABEL: Record<Window, string> = { night: "Night, 8pm to 5am", day: "Day, 9am to 3pm", "24 hours": "24 hours" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-AU");
// Rounded for sentences, so a model estimate doesn't read as a precise count.
const about = (n: number) => fmt(n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function formatHour(h: number) {
  if (h === 0 || h === 24) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function planHours(req: ImpactRequest): number[] | null {
  const { start_hour: s, end_hour: e } = req.work_hours;
  if (s === null || e === null || s === e) return null;
  const hours = [];
  for (let h = s; h !== e % 24; h = (h + 1) % 24) hours.push(h);
  return hours;
}

// Work window in the lookup that overlaps the plan's hours most (share of combined hours).
function nearestWindow(hours: number[]): Window {
  const score = (w: Window) => {
    const win = new Set(WINDOWS[w]);
    const both = hours.filter(h => win.has(h)).length;
    return both / new Set([...hours, ...WINDOWS[w]]).size;
  };
  return (Object.keys(WINDOWS) as Window[]).reduce((a, b) => score(b) > score(a) ? b : a);
}

const range = (s: Record<"low" | "typical" | "worst", ScenarioSummary>, key: keyof ScenarioSummary, unit: string): Range => {
  const [low, typical, high] = [s.low[key], s.typical[key], s.worst[key]].map(Math.round);
  return { low: Math.min(low, typical, high), typical, high: Math.max(low, typical, high), unit };
};

export async function estimate(req: ImpactRequest): Promise<ImpactResult> {
  const assumptions: string[] = [];
  const daily = req.site.daily_volume;
  const aadt = (daily ?? DEFAULT_DAILY) * (daily ? CLOSED_STREET_SHARE : 1);
  if (daily) assumptions.push(`Traffic from signal site ${req.site.scats_site_no} ${req.site.scats_site_name}: ${fmt(daily)} vehicles on an average weekday across all approaches. Assumed half of them use ${req.site.street}, split evenly by direction.`);
  if (daily && req.site.tram_route) assumptions.push(`${req.site.street} carries trams. Where cars are limited on a tram street (tram-only or permit-only sections), far less than half the site's traffic uses it, so diversions may be greatly overstated.`);
  else assumptions.push(`No traffic signal site matched ${req.site.street}. Assumed ${fmt(DEFAULT_DAILY)} vehicles a day, split evenly by direction.`);
  const roadClass = roadClassFromVolume(daily ?? DEFAULT_DAILY);
  assumptions.push(`Road size group for past closures: ${roadClass}, from the signal site's daily count.`);

  // A lane closure needs a lane left open. If the plan doesn't show lanes, assume 2 each way with 1 open.
  const lanesUnknown = req.lanes_per_direction < 1;
  const partial = req.closure_type !== "road closed" && req.closure_type !== "footpath only";
  const lanesPerDirection = lanesUnknown ? (partial ? 2 : 1) : req.lanes_per_direction;
  let lanesOpen = req.closure_type === "road closed" ? 0 : req.closure_type === "footpath only" ? lanesPerDirection : Math.min(req.lanes_open, lanesPerDirection);
  if (partial && lanesOpen < 1) lanesOpen = Math.max(1, lanesPerDirection - 1);
  if (lanesUnknown) assumptions.push(partial ? "The plan does not show the number of lanes. Assumed 2 lanes each way with 1 left open." : "The plan does not show the number of lanes. Assumed 1 lane each way.");
  else if (partial && req.lanes_open < 1) assumptions.push(`The plan does not show how many lanes stay open. Assumed ${lanesOpen}.`);
  if (req.closure_type === "road closed") {
    assumptions.push("The road is fully closed, so it is modelled as 0 lanes open. The past-closure lookup has no full-closure group, so it uses its all-closures fallback.");
    assumptions.push("With no lanes open, the queue model holds a 500 m queue and sends everyone else on the detour. Drivers usually divert earlier at the VMS boards, so queue and delay are likely overstated. Diversions are the key number.");
  }

  const hours = planHours(req);
  const window = hours ? nearestWindow(hours) : "day";
  const period = hours ? `${req.work_hours.days ? `${req.work_hours.days} ` : ""}${formatHour(req.work_hours.start_hour!)} to ${formatHour(req.work_hours.end_hour!)}` : WINDOW_LABEL.day;
  if (hours) assumptions.push(`Queue calculated over the plan's hours (${period}). Past closures are matched on the nearest recorded work window: ${WINDOW_LABEL[window].toLowerCase()}.`);
  else assumptions.push(`The plan's work hours could not be read. Assumed day works, 9am to 3pm.`);

  const args = { closureType: req.closure_type, aadt, lanesPerDirection, lanesOpen, roadClass };
  const plan = predict(T, { ...args, workWindow: window, activeHours: hours ?? undefined });
  const s = plan.scenarios;
  const lk = plan.summary;
  assumptions.push(`Based on ${fmt(lk.based_on_n_past_closures)} past Melbourne closures (lookup level ${lk.lookup_level} of 3). Traffic past similar works changed by ${pct(lk.traffic_change_range[0])} to ${pct(lk.traffic_change_range[1])}, typically ${pct(lk.traffic_change_typical)}.`);
  assumptions.push("Low, typical and high use the 10th, 50th and 90th percentile traffic change from those closures.");
  assumptions.push("Capacity 800 vehicles an hour per lane, 85% beside works. Drivers tolerate a 500 m queue, then divert. 7 m per queued vehicle. Weekday hourly profile from SCATS counts.");

  // Compare the plan's hours with the standard night and day windows on the worse case.
  // Tamara's compare_windows ranks on delay. With the road closed, delay only tracks how
  // long the 500 m queue is held, so rank on forced diversions instead.
  const byDiversions = lanesOpen === 0;
  const worstOf = (sc: ScenarioSummary) => byDiversions ? sc.forced_diversions_veh : sc.delay_veh_h;
  const measure = byDiversions ? "forced diversions" : "delay";
  const unit = byDiversions ? "vehicles" : "vehicle-hours";
  const options = [
    { label: hours ? `Planned hours, ${period}` : WINDOW_LABEL.day, worst: worstOf(s.worst), isPlan: true },
    ...(["night", "day"] as Window[]).filter(w => hours || w !== "day").map(w => ({ label: WINDOW_LABEL[w], worst: worstOf(predict(T, { ...args, workWindow: w }).scenarios.worst), isPlan: false })),
  ].sort((a, b) => a.worst - b.worst);
  const best = options[0];
  const planOption = options.find(o => o.isPlan)!;
  const recommended_window = best.isPlan
    ? { window: best.label, reason: `The planned hours already give the lowest worst-case ${measure} of the windows compared.` }
    : { window: best.label, reason: `Worst-case ${measure} of about ${about(best.worst)} ${unit}, against ${about(planOption.worst)} for the planned hours. The windows differ in length, so check the work fits.` };

  const delay = range(s, "delay_veh_h", "vehicle-hours");
  const queue = range(s, "max_queue_m", "m");
  const diversions = range(s, "forced_diversions_veh", "vehicles");
  const carSummary = lanesOpen === 0
    ? `About ${about(diversions.typical)} vehicles must take the detour during the works (${about(diversions.low)} to ${about(diversions.high)}).`
    : diversions.typical > 0
      ? `About ${about(diversions.typical)} vehicles are forced onto other routes (${about(diversions.low)} to ${about(diversions.high)}). Queues can reach ${about(queue.high)} m.`
      : queue.high > 0 ? `Queues can reach ${about(queue.high)} m. Delay totals ${about(delay.low)} to ${about(delay.high)} vehicle-hours.` : "No queue is expected with the lanes left open.";

  const notModelled = (summary: string): ModeImpact => ({ status: "not modelled", summary });
  return {
    model: "mvm",
    method: "Lookup of 2,700 past Melbourne closures, then an hourly queue",
    label: null,
    provenance: "live",
    confidence: lk.lookup_level === 1 && req.closure_type !== "road closed" ? "medium" : "low",
    confidence_note: "Its typical estimate does not beat assuming no change, so read the ranges and the risk, not a single number.",
    period,
    recommended_window,
    modes: {
      cars: { status: "modelled", delay, max_queue: queue, forced_diversions: diversions, summary: carSummary },
      trucks: notModelled("Trucks are counted with all vehicles. They are not modelled on their own."),
      public_transport: notModelled("This model covers road traffic only. Trams and buses are not modelled."),
      pedestrians: notModelled("This model covers road traffic only. Pedestrians are not modelled."),
    },
    assumptions,
    generated_at: new Date().toISOString(),
  };
}

export const mvmModel: ImpactModel = { id: "mvm", method: "Lookup of 2,700 past Melbourne closures, then an hourly queue", estimate };
