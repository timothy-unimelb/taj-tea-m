// Compares a registration report with Tamara's validated Swanston St
// transforms (scans/swanston_registered_v2/transforms_v2.json): the relative
// placement of each scan against the anchor, in both.
// Run: node_modules/.bin/jiti tools/scan_register/compare_v2.ts report.json [transforms_v2.json]

import { readFileSync } from "node:fs";
import { describeRelative, inv4, mul4, rotationDeg, type Mat4 } from "../../lib/scan/register";

const [reportPath, v2Path = "scans/swanston_registered_v2/transforms_v2.json"] = process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const v2 = JSON.parse(readFileSync(v2Path, "utf8")).transform_raw_utm_to_v2_utm as Record<string, number[][]>;
const flat = (m: number[][]): Mat4 => m.flat();
const idOf = (name: string) => Object.keys(v2).find(k => name.includes(k));
const scans = report.scans as { name: string; status: string; centre_raw: [number, number] }[];
const anchor = scans.findIndex(s => s.status === "anchor");
const Ta = flat(v2[idOf(scans[anchor].name)!]);
const O = report.origin as number[];
const S: Mat4 = [1, 0, 0, -O[0], 0, 1, 0, -O[1], 0, 0, 1, -O[2], 0, 0, 0, 1], Si: Mat4 = [1, 0, 0, O[0], 0, 1, 0, O[1], 0, 0, 1, O[2], 0, 0, 0, 1];
console.log(`anchor ${scans[anchor].name}. Each scan relative to the anchor's raw frame: Tamara's v2 vs this run, and the difference at the scan centre.`);
scans.forEach((s, i) => {
  const id = idOf(s.name);
  if (!id) return;
  const hers = mul4(inv4(Ta), flat(v2[id])), mine = report.scans_relative[i] as Mat4;
  const c = [s.centre_raw[0], s.centre_raw[1], 0];
  const at = (T: Mat4) => [T[0] * c[0] + T[1] * c[1] + T[3], T[4] * c[0] + T[5] * c[1] + T[7], T[8] * c[0] + T[9] * c[1] + T[11]];
  const a = at(hers), b = at(mine), cL: [number, number] = [c[0] - O[0], c[1] - O[1]];
  console.log(`  ${s.name}: v2 ${describeRelative(mul4(S, mul4(hers, Si)), cL)} | this run ${describeRelative(mul4(S, mul4(mine, Si)), cL)} | difference ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(2)} m horizontal, ${Math.abs(a[2] - b[2]).toFixed(2)} m vertical, ${rotationDeg(mul4(hers, inv4(mine))).toFixed(2)} deg`);
});
