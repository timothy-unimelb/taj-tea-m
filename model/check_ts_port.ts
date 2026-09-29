// Checks the app's TypeScript port (lib/impact/models/mvm-core.ts) against
// the Python model's own example. Run from the repo root:
//   node_modules/.bin/jiti model/check_ts_port.ts
// Then compare with: cd model/mvm && ../.venv/bin/python mvm_predict.py
// Expected (model/mvm/REPLICATION_CONTEXT.md section 5): night about 12, day about 429,
// 24 hours about 1,022 vehicle-hours of typical delay.
import { predict, roadClassFromVolume, type MvmTables } from "../lib/impact/models/mvm-core";
import tables from "../data/impact/mvm-tables.json";

const t = tables as unknown as MvmTables;
const site = t.sites.find(s => s[0] === 4391)!; // GRATTAN/SWANSTON, as in the Python example
const roadClass = roadClassFromVolume(site[4]);
for (const workWindow of ["night", "day", "24 hours"] as const) {
  const r = predict(t, { closureType: "lanes closed", workWindow, aadt: 40000, lanesPerDirection: 2, lanesOpen: 1, roadClass });
  const { typical, worst } = r.scenarios;
  console.log([
    workWindow.padEnd(8), roadClass, `level ${r.summary.lookup_level}`, `n ${r.summary.based_on_n_past_closures}`,
    `typical: delay ${typical.delay_veh_h.toFixed(1)} veh-h, queue ${Math.round(typical.max_queue_m)} m, ${typical.queue_hours} h, diversions ${typical.forced_diversions_veh}`,
    `worst: delay ${worst.delay_veh_h.toFixed(1)} veh-h, queue ${Math.round(worst.max_queue_m)} m, ${worst.queue_hours} h, diversions ${worst.forced_diversions_veh}`,
  ].join(" | "));
}
