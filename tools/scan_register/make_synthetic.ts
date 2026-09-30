// Makes synthetic phone scans of a street for testing the registration
// without the real Swanston St scans: four overlapping LAS scans of one
// street, each with phone-like georeferencing errors (heading up to 25
// degrees, position up to 15 m, height up to 2 m, tilt about 1 degree),
// the true transforms, and the reference map data the true street matches.
//
// Run: node_modules/.bin/jiti tools/scan_register/make_synthetic.ts <out dir> [seed]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { utmToLl } from "../../lib/scan/geo";
import { writeLas } from "../../lib/scan/las";

const [outDir = "scratch/synthetic", seedArg = "1"] = process.argv.slice(2);
let seed = Number(seedArg) || 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// The street in its own frame: x east across the street, y north along it, ground height 0 at the road.
const KERB_X = 3.0, WALL_X = 7.9, SEP = [0, 0.4], BIKE = [0.4, 3.0], PATH = [3.0, 7.9], GRADE = 0.02;
const TREES = [6, 21, 38, 59].map(y => ({ x: 3.8, y }));
const RECESS = { y0: 30, y1: 36, depth: 2.1 }, GAP = { y0: 50, y1: 53, depth: 4 }, WALL_END = 66;
// Wall x at a given y (the building face), including the V recess. Null in the gap or past the end.
function wallX(y: number): number | null {
  if (y > WALL_END || y < -10) return null;
  if (y >= GAP.y0 && y <= GAP.y1) return null;
  if (y >= RECESS.y0 && y <= RECESS.y1) { const t = (y - RECESS.y0) / (RECESS.y1 - RECESS.y0); return WALL_X + RECESS.depth * (1 - Math.abs(2 * t - 1)); }
  return WALL_X;
}
function groundH(x: number): number { // height above the road surface
  if (x >= SEP[0] && x < SEP[1]) return 0.1;
  if (x >= PATH[0]) return 0.14;
  if (x >= -6.55 && x < -6.45) return -0.02; // tram rail grooves
  if (x >= -5.05 && x < -4.95) return -0.02;
  return 0;
}
// Irregular brightness patches (stains, repairs) about 1 to 3 m across, fixed per position.
function patch(x: number, y: number): number {
  const h = Math.sin(x * 2.1 + 0.7) * Math.sin(y * 0.9 + 1.3) + 0.6 * Math.sin(x * 0.7 - y * 1.7 + 2.0);
  return h > 0.9 ? -0.15 : h < -1.1 ? 0.12 : 0;
}
function groundBright(x: number, y: number): number {
  if (x >= PATH[0]) { const j = ((y % 0.6) + 0.6) % 0.6; return (j < 0.03 ? 0.5 : 0.55) + patch(x, y); } // faint paving joints, stains
  if (x >= BIKE[0] && x < BIKE[1]) { const s = ((y % 8) + 8) % 8; return s < 1.5 && x > 1.4 && x < 2.0 ? 0.9 : 0.45; } // green lane, stencils every 8 m
  if (x >= SEP[0] && x < SEP[1]) return 0.6;
  if (x > -4.05 && x < -3.95) { const d = ((y % 9) + 9) % 9; return d < 3 ? 0.85 : 0.35; } // dashed lane line
  return 0.35;
}

type Pt = { x: number; y: number; z: number; b: number };
function sampleStreet(y0: number, y1: number, x0: number, x1: number, density: number): Pt[] {
  const pts: Pt[] = [];
  const area = (y1 - y0) * (x1 - x0);
  for (let i = 0; i < area * density; i++) {
    const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
    const wx = wallX(y);
    if (wx !== null && x > wx) continue;
    pts.push({ x, y, z: groundH(x) + GRADE * y + gauss() * 0.008, b: groundBright(x, y) + gauss() * 0.03 });
  }
  // Kerb face and separator faces (vertical).
  for (let y = y0; y < y1; y += 0.02) for (let k = 0; k < 6; k++) pts.push({ x: KERB_X + gauss() * 0.005, y, z: rand() * 0.14 + GRADE * y, b: 0.5 });
  // Building face with the recess and the gap's side walls, up to 6 m.
  for (let y = y0; y < y1; y += 0.015) {
    const wx = wallX(y);
    if (wx === null) continue;
    for (let k = 0; k < 8; k++) pts.push({ x: wx + gauss() * 0.01, y, z: 0.14 + rand() * 6 + GRADE * y, b: 0.4 + 0.15 * Math.sin(y * 3) });
  }
  for (const gy of [GAP.y0, GAP.y1]) if (gy > y0 && gy < y1) for (let d = 0; d < GAP.depth; d += 0.02) for (let k = 0; k < 6; k++) pts.push({ x: WALL_X + d, y: gy + gauss() * 0.01, z: 0.14 + rand() * 6 + GRADE * gy, b: 0.45 });
  if (WALL_END > y0 && WALL_END < y1) for (let d = 0; d < 6; d += 0.02) for (let k = 0; k < 6; k++) pts.push({ x: WALL_X + d, y: WALL_END + gauss() * 0.01, z: 0.14 + rand() * 6 + GRADE * WALL_END, b: 0.45 });
  // Trees: trunk and a sparse canopy. Poles and bins.
  for (const t of TREES) if (t.y > y0 && t.y < y1) {
    for (let i = 0; i < 1500; i++) { const a = rand() * 2 * Math.PI; pts.push({ x: t.x + 0.14 * Math.cos(a), y: t.y + 0.14 * Math.sin(a), z: 0.14 + rand() * 3 + GRADE * t.y, b: 0.3 }); }
    for (let i = 0; i < 1500; i++) { const a = rand() * 2 * Math.PI, e = Math.acos(2 * rand() - 1), r = 1.8; pts.push({ x: t.x + r * Math.sin(e) * Math.cos(a), y: t.y + r * Math.sin(e) * Math.sin(a), z: 4.2 + r * Math.cos(e) + GRADE * t.y, b: 0.35 }); }
  }
  const objects = [{ x: 3.6, y: 0.5, r: 0.08, h: 4 }, { x: 3.5, y: 45, r: 0.04, h: 2.5 }, { x: 3.6, y: 61.5, r: 0.05, h: 3 }, { x: 3.5, y: 17.5, r: 0.04, h: 2.4 }];
  // A bench against the wall.
  if (11 > y0 && 11 < y1) for (let i = 0; i < 3000; i++) pts.push({ x: 7.0 + rand() * 0.5, y: 10.2 + rand() * 1.8, z: 0.14 + 0.45 + rand() * 0.05 + GRADE * 11, b: 0.35 });
  for (const o of objects) if (o.y > y0 && o.y < y1) for (let i = 0; i < 800; i++) { const a = rand() * 2 * Math.PI; pts.push({ x: o.x + o.r * Math.cos(a), y: o.y + o.r * Math.sin(a), z: 0.14 + rand() * o.h + GRADE * o.y, b: 0.5 }); }
  for (const bin of [{ x: 4.2, y: 15 }, { x: 4.2, y: 48 }]) if (bin.y > y0 && bin.y < y1) for (let i = 0; i < 2000; i++) {
    const side = Math.floor(rand() * 4), u = rand() * 0.6 - 0.3;
    const dx = side === 0 ? -0.3 : side === 1 ? 0.3 : u, dy = side >= 2 ? (side === 2 ? -0.3 : 0.3) : u;
    pts.push({ x: bin.x + dx, y: bin.y + dy, z: 0.14 + rand() * 1.0 + GRADE * bin.y, b: 0.25 });
  }
  return pts;
}

// Map placement: the street frame turned by BEARING and moved to a UTM position near Swanston St.
const BEARING = -8 * Math.PI / 180, E0 = 320790, N0 = 5814450, Z0 = 41.0;
function toMap(p: { x: number; y: number; z: number }) {
  const c = Math.cos(BEARING), s = Math.sin(BEARING);
  return { e: E0 + c * p.x - s * p.y, n: N0 + s * p.x + c * p.y, z: Z0 + p.z };
}

const windows = [[-2, 20], [14, 38], [32, 54], [48, 72]];
mkdirSync(outDir, { recursive: true });
const truth: Record<string, unknown>[] = [];
const zone = { zone: 55, south: true };
const geokeys = new Uint16Array([1, 1, 0, 3, 1024, 0, 1, 1, 3072, 0, 1, 32755, 3076, 0, 1, 9001]);
const vlr = new Uint8Array(54 + geokeys.byteLength);
vlr.set(new TextEncoder().encode("LASF_Projection"), 2);
new DataView(vlr.buffer).setUint16(18, 34735, true);
new DataView(vlr.buffer).setUint16(20, geokeys.byteLength, true);
vlr.set(new Uint8Array(geokeys.buffer), 54);
windows.forEach(([y0, y1], i) => {
  const pts = sampleStreet(y0, y1, -7, 9.5, 700);
  // Phone error: turn about the scan centre, move, lift, tilt a little.
  const yawErr = (rand() * 50 - 25) * Math.PI / 180, dx = Math.max(-15, Math.min(15, gauss() * 8)), dy = Math.max(-15, Math.min(15, gauss() * 8)), dz = rand() * 4 - 2;
  const tilt = (rand() * 2 - 1) * Math.PI / 180, tiltDir = rand() * 2 * Math.PI;
  const centre = toMap({ x: 1, y: (y0 + y1) / 2, z: 0 });
  const c = Math.cos(yawErr), s = Math.sin(yawErr), ct = Math.cos(tilt), st = Math.sin(tilt), kx = Math.cos(tiltDir), ky = Math.sin(tiltDir);
  // Rotation = yaw about z then a small rotation about the horizontal axis (kx, ky, 0).
  const Ry = [c, -s, 0, s, c, 0, 0, 0, 1];
  const Rt = [ct + kx * kx * (1 - ct), kx * ky * (1 - ct), ky * st, ky * kx * (1 - ct), ct + ky * ky * (1 - ct), -kx * st, -ky * st, kx * st, ct];
  const R = [0, 1, 2].flatMap(r => [0, 1, 2].map(col => Rt[r * 3] * Ry[col] + Rt[r * 3 + 1] * Ry[3 + col] + Rt[r * 3 + 2] * Ry[6 + col]));
  const xyz = new Float64Array(pts.length * 3), rgb = new Uint8Array(pts.length * 3);
  const gain = 0.9 + rand() * 0.2;
  pts.forEach((p, k) => {
    const m = toMap(p), px = m.e - centre.e, py = m.n - centre.n, pz = m.z - centre.z;
    xyz[k * 3] = R[0] * px + R[1] * py + R[2] * pz + centre.e + dx;
    xyz[k * 3 + 1] = R[3] * px + R[4] * py + R[5] * pz + centre.n + dy;
    xyz[k * 3 + 2] = R[6] * px + R[7] * py + R[8] * pz + centre.z + dz;
    const v = Math.max(0, Math.min(255, Math.round(p.b * gain * 255)));
    rgb[k * 3] = v; rgb[k * 3 + 1] = p.x >= BIKE[0] && p.x < BIKE[1] && p.z - GRADE * p.y < 0.05 ? Math.min(255, v + 40) : v; rgb[k * 3 + 2] = v;
  });
  const name = `synthetic_scan_${i + 1}.las`;
  writeFileSync(join(outDir, name), writeLas([{ xyz, rgb, count: pts.length }], vlr, "synthetic"));
  // Raw -> true: undo the error. x_true = R^T (x_raw - centre - d) + centre.
  const Rt3 = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const off = [centre.e + dx, centre.n + dy, centre.z + dz];
  const t = [centre.e - (Rt3[0] * off[0] + Rt3[1] * off[1] + Rt3[2] * off[2]), centre.n - (Rt3[3] * off[0] + Rt3[4] * off[1] + Rt3[5] * off[2]), centre.z - (Rt3[6] * off[0] + Rt3[7] * off[1] + Rt3[8] * off[2])];
  truth.push({ name, points: pts.length, yaw_error_deg: yawErr * 180 / Math.PI, shift_m: [dx, dy, dz], transform: [Rt3[0], Rt3[1], Rt3[2], t[0], Rt3[3], Rt3[4], Rt3[5], t[1], Rt3[6], Rt3[7], Rt3[8], t[2], 0, 0, 0, 1] });
  console.log(`${name}: ${pts.length} points, heading error ${(yawErr * 180 / Math.PI).toFixed(1)} deg, moved (${dx.toFixed(1)}, ${dy.toFixed(1)}, ${dz.toFixed(1)}) m`);
});
writeFileSync(join(outDir, "truth.json"), JSON.stringify({ epsg: 32755, scans: truth }, null, 1));

// Reference map data for the true street, as the app's reference route returns it (lon, lat).
const ll = (x: number, y: number) => { const m = toMap({ x, y, z: 0 }); const p = utmToLl(m.e, m.n, zone); return [p.lon, p.lat]; };
const face: [number, number][] = [];
for (let y = -10; y <= WALL_END; y += 0.5) { const wx = wallX(y); face.push([wx ?? WALL_X, y]); }
const buildingA = [...face.filter(([, y]) => y <= GAP.y0).map(([x, y]) => ll(x, y)), ll(WALL_X + 30, GAP.y0), ll(WALL_X + 30, -10)];
const buildingB = [...face.filter(([, y]) => y >= GAP.y1).map(([x, y]) => ll(x, y)), ll(WALL_X + 30, WALL_END), ll(WALL_X + 30, GAP.y1)];
const footpath = [ll(PATH[0], -10), ll(PATH[0], WALL_END + 10), ll(PATH[1], WALL_END + 10), ll(PATH[1], -10)];
const reference = { source: "synthetic", buildings: [buildingA, buildingB], footpaths: [footpath], trees: TREES.map(t => ll(t.x, t.y)), heights: [] };
writeFileSync(join(outDir, "reference.json"), JSON.stringify(reference));
console.log(`wrote ${outDir}/truth.json and reference.json`);
