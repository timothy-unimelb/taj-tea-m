// Registers LAS scans of one site into one georeferenced site scan, with no
// manual step. The same code the app runs in the browser (lib/scan/).
//
// Run: node_modules/.bin/jiti tools/scan_register/register.ts out.las in1.las in2.las ... [options]
//   --report out.json     write the registration report
//   --reference ref.json  place the site on the map from saved reference data (default: fetch it)
//   --no-georef           skip the map placement, only fit the scans to each other
//   --truth truth.json    print errors against known true transforms (synthetic tests)
//   --save-reference f    save the fetched map data as JSON (reusable with --reference)
// The full log is written next to the output as <out>.log.

import { readFileSync, writeFileSync } from "node:fs";
import { readLas, writeLas } from "../../lib/scan/las";
import { describeRelative, mul4, inv4, rotationDeg, registerScans, type Mat4 } from "../../lib/scan/register";
import { buildSiteScan, type Reference } from "../../lib/scan/site-scan";

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (name: string) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const report = opt("--report"), referencePath = opt("--reference"), truthPath = opt("--truth"), noGeoref = flag("--no-georef"), grid = Number(opt("--grid") ?? 256), saveReference = opt("--save-reference");
const [out, ...inputs] = args;
if (!out || !inputs.length) { console.error("Usage: register.ts out.las in1.las [in2.las ...] [--report r.json] [--reference ref.json] [--no-georef] [--truth truth.json]"); process.exit(1); }

const reference: Reference | null = referencePath ? JSON.parse(readFileSync(referencePath, "utf8")) : null;
const t0 = Date.now();
const logLines: string[] = [];
const say = (line: string) => { console.log(line); logLines.push(line); };
buildSiteScan(inputs.map(p => ({ name: p.split("/").pop()!, buffer: readFileSync(p).buffer.slice(0) as ArrayBuffer })), {
  georef: noGeoref ? "skip" : reference ? { reference } : "fetch",
  register: { gridN: grid },
  fetchReference: async (lat, lon, radius) => { const m = await import("../../lib/scan/reference"); const ref = await m.fetchReference(lat, lon, radius); if (saveReference) writeFileSync(saveReference, JSON.stringify(ref)); return ref; },
  onProgress: m => say(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`),
  log: m => say(`   ${m}`),
}).then(result => {
  writeFileSync(`${out}.log`, logLines.join("\n") + "\n");
  writeFileSync(out, result.las);
  console.log(`wrote ${out}: ${result.report.points.toLocaleString()} points from ${inputs.length} scans in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const f of result.report.scans) console.log(`  ${f.name}: ${f.status}, rms ${f.rms_m === null ? "-" : (f.rms_m * 100).toFixed(1) + " cm"}, overlap ${f.overlap ?? "-"}, consistency ${f.consistency ?? "-"}. ${f.note}`);
  console.log(`  placement: ${result.report.placement.note}`);
  for (const n of result.report.notes) console.log(`  note: ${n}`);
  if (report) writeFileSync(report, JSON.stringify(result.report, null, 1));
  if (truthPath) {
    const truth = JSON.parse(readFileSync(truthPath, "utf8")).scans as { name: string; transform: Mat4 }[];
    const scans = result.report.scans, anchor = scans.findIndex(s => s.status === "anchor");
    const Ta = truth.find(t => t.name === scans[anchor].name)!.transform;
    const at = (T: Mat4, p: number[]) => [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]];
    const O = result.report.origin, S: Mat4 = [1, 0, 0, -O[0], 0, 1, 0, -O[1], 0, 0, 1, -O[2], 0, 0, 0, 1], Si: Mat4 = [1, 0, 0, O[0], 0, 1, 0, O[1], 0, 0, 1, O[2], 0, 0, 0, 1];
    console.log("truth check. relative: heading and shift about the scan centre, true vs found; errors at the site relative to the anchor scan and on the map:");
    scans.forEach((s, i) => {
      const tr = truth.find(t => t.name === s.name)!.transform;
      const c = [s.centre_raw[0], s.centre_raw[1], 0];
      const trueRel = mul4(inv4(Ta), tr);          // raw i -> the anchor's raw frame, where registration happens
      const rel = result.report.scans_relative[i];
      const cL: [number, number] = [c[0] - O[0], c[1] - O[1]];
      const pTrue = at(tr, c);
      const eRel = at(mul4(Ta, rel), c), eAbs = at(s.transform, c);
      console.log(`  ${s.name}: true ${describeRelative(mul4(S, mul4(trueRel, Si)), cL)} | found ${describeRelative(mul4(S, mul4(rel, Si)), cL)} | scan-to-scan error ${(Math.hypot(eRel[0] - pTrue[0], eRel[1] - pTrue[1]) * 100).toFixed(1)} cm horizontal, ${(Math.abs(eRel[2] - pTrue[2]) * 100).toFixed(1)} cm vertical, ${rotationDeg(mul4(mul4(Ta, rel), inv4(tr))).toFixed(2)} deg | map error ${Math.hypot(eAbs[0] - pTrue[0], eAbs[1] - pTrue[1]).toFixed(2)} m, ${rotationDeg(mul4(s.transform, inv4(tr))).toFixed(2)} deg`);
    });
  }
}).catch(e => { console.error(e); process.exit(1); });
export {};
void readLas; void writeLas; void registerScans;
