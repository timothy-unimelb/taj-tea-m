// TypeScript port of Tamara's model/mvm/mvm_predict.py: a lookup learned from
// about 2,700 past Melbourne closures, then an hour-by-hour queue.
// Kept line for line close to the Python so the two are easy to compare.
// Two additions, both optional: `activeHours` runs the queue over the plan's own
// hours, and a third "low" scenario uses the P10 traffic change.

export type LookupRow = {
  level: number; site_relation: string; closure_type: string; work_window: string; time_band: string;
  road_class: string | null; n_closures: number; p10: number; p50: number; p90: number;
  mean_change: number; share_over_15pct_drop: number;
};
export type MvmTables = { lookup: LookupRow[]; weekday_hourly_share: number[]; sites: [number, string, number | null, number | null, number][] };

export type Window = "night" | "day" | "24 hours";
export const WINDOWS: Record<Window, number[]> = {
  night: [20, 21, 22, 23, 0, 1, 2, 3, 4],
  day: [9, 10, 11, 12, 13, 14],
  "24 hours": Array.from({ length: 24 }, (_, h) => h),
};
export const band = (h: number) => 7 <= h && h <= 8 ? "AM peak" : 9 <= h && h <= 15 ? "Inter-peak" : 16 <= h && h <= 18 ? "PM peak" : "Night";

export const roadClassFromVolume = (v: number) =>
  v < 20000 ? "low (<20k/day)" : v < 40000 ? "medium (20-40k/day)" : "high (>40k/day)";

// Most specific lookup row with >= 20 past closures (level 1, then 2, then 3).
export function lookup(tables: MvmTables, closureType: string, workWindow: string, timeBand: string, roadClass: string, siteRelation = "same street") {
  const rows = tables.lookup.filter(r => r.site_relation === siteRelation && r.time_band === timeBand);
  const tests: [number, (r: LookupRow) => boolean][] = [
    [1, r => r.closure_type === closureType && r.work_window === workWindow && r.road_class === roadClass],
    [2, r => r.closure_type === closureType && r.work_window === workWindow],
    [3, r => r.level === 3],
  ];
  for (const [level, test] of tests) {
    const hit = rows.find(r => r.level === level && test(r));
    if (hit) return hit;
  }
  throw new Error("no lookup row");
}

export type PredictArgs = {
  closureType: string; workWindow: Window; aadt: number; lanesPerDirection: number; lanesOpen: number;
  roadClass: string; activeHours?: number[]; directionSplit?: number; capacityPerLane?: number;
  workZoneFactor?: number; vehLengthM?: number; maxQueueMPerLane?: number;
};
const SCENARIOS = [["low", "p10"], ["typical", "p50"], ["worst", "p90"]] as const;
export type Scenario = typeof SCENARIOS[number][0];
export type ScenarioSummary = { delay_veh_h: number; max_queue_m: number; queue_hours: number; forced_diversions_veh: number };

export function predict(tables: MvmTables, a: PredictArgs) {
  const { directionSplit = 0.5, capacityPerLane = 800, workZoneFactor = 0.85, vehLengthM = 7.0, maxQueueMPerLane = 500 } = a;
  const active = new Set(a.activeHours ?? WINDOWS[a.workWindow]);
  const maxQueueVeh = maxQueueMPerLane / vehLengthM * Math.max(a.lanesOpen, 1);
  const q: Record<Scenario, number> = { low: 0, typical: 0, worst: 0 };
  const hourly: Record<string, number | string | boolean>[] = [];
  // Start at 05:00 so overnight works run continuously.
  for (const h of [...Array.from({ length: 19 }, (_, i) => i + 5), 0, 1, 2, 3, 4]) {
    const lk = lookup(tables, a.closureType, a.workWindow, band(h), a.roadClass);
    const demand = a.aadt * directionSplit * (tables.weekday_hourly_share[h] ?? 0);
    const works = active.has(h);
    const cap = works ? a.lanesOpen * capacityPerLane * workZoneFactor : a.lanesPerDirection * capacityPerLane;
    const row: Record<string, number | string | boolean> = { hour: h, time_band: band(h), works_active: works, base_demand_veh_h: demand, capacity_veh_h: cap, lookup_level: lk.level, n_past_closures: lk.n_closures };
    // low = P10 change (most traffic avoided the site), typical = P50, worst = P90 (least avoided).
    for (const [sc, p] of SCENARIOS) {
      const d = demand * (1 + (works ? lk[p] : 0));
      const qPrev = q[sc];
      const qNew = Math.max(0, qPrev + d - cap);
      const forced = Math.max(0, qNew - maxQueueVeh); // beyond the tolerable queue, drivers divert
      q[sc] = qNew - forced;
      row[`queue_veh_${sc}`] = q[sc];
      row[`forced_diversion_veh_${sc}`] = forced;
      row[`delay_veh_h_${sc}`] = (qPrev + q[sc]) / 2;
    }
    hourly.push(row);
  }
  const lkW = lookup(tables, a.closureType, a.workWindow, a.workWindow === "night" ? "Night" : "Inter-peak", a.roadClass);
  const sum = (key: string) => hourly.reduce((t, r) => t + (r[key] as number), 0);
  const scenarios = Object.fromEntries(SCENARIOS.map(([sc]) => [sc, {
    delay_veh_h: sum(`delay_veh_h_${sc}`),
    // Python rounds queues per hour before taking the max; round here too to match.
    max_queue_m: Math.max(...hourly.map(r => Math.round(r[`queue_veh_${sc}`] as number))) * vehLengthM / Math.max(a.lanesOpen, 1),
    queue_hours: hourly.filter(r => (r[`queue_veh_${sc}`] as number) > 0).length,
    // Python sums whole vehicles per hour.
    forced_diversions_veh: hourly.reduce((t, r) => t + Math.round(r[`forced_diversion_veh_${sc}`] as number), 0),
  }])) as Record<Scenario, ScenarioSummary>;
  return {
    lookupRow: lkW,
    summary: {
      closure_type: a.closureType, work_window: a.workWindow, road_class: a.roadClass,
      traffic_change_typical: lkW.p50, traffic_change_range: [lkW.p10, lkW.p90] as const,
      chance_of_over_15pct_drop: lkW.share_over_15pct_drop, based_on_n_past_closures: lkW.n_closures, lookup_level: lkW.level,
    },
    scenarios,
    hourly,
  };
}
