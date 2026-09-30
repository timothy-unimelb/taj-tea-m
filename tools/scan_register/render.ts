// Renders scans from above to a PNG, each scan in its own colour tint, with the
// transforms from a registration report applied. For checking a registration by eye:
// kerbs and building faces should run on unbroken across scans.
// Run: node_modules/.bin/jiti tools/scan_register/render.ts out.png report.json scan_dir [--res 0.05] [--raw]
//   --raw  ignores the report's transforms (shows the phone placement)
// Or:  node_modules/.bin/jiti tools/scan_register/render.ts out.png --las a.las b.las ... (no transforms)

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readLas } from "../../lib/scan/las";
import type { Mat4 } from "../../lib/scan/register";
import { llToUtm, utmZoneFromEpsg } from "../../lib/scan/geo";

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (name: string) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const res = Number(opt("--res") ?? 0.05), raw = flag("--raw"), lasMode = flag("--las"), ground = flag("--ground"), colour = flag("--colour"), v2Path = opt("--v2"), referencePath = opt("--reference");
const [out, ...rest] = args;

type Layer = { name: string; xyz: Float64Array; rgb: Uint8Array | null; count: number; epsg: number | null; T: Mat4 | null };
const layers: Layer[] = [];
if (lasMode) for (const f of rest) { const c = readLas(readFileSync(f).buffer.slice(0) as ArrayBuffer, f); layers.push({ ...c, T: null }); }
else {
  const [reportPath, dir] = rest;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const v2 = v2Path ? JSON.parse(readFileSync(v2Path, "utf8")).transform_raw_utm_to_v2_utm as Record<string, number[][]> : null;
  for (const s of report.scans as { name: string; transform: Mat4 }[]) {
    const c = readLas(readFileSync(join(dir, s.name)).buffer.slice(0) as ArrayBuffer, s.name);
    const id = v2 ? Object.keys(v2).find(k => s.name.includes(k)) : undefined;
    layers.push({ ...c, T: raw ? null : v2 && id ? v2[id].flat() : s.transform });
  }
}
const TINTS = [[255, 120, 120], [120, 200, 255], [140, 255, 140], [255, 220, 120], [230, 150, 255], [255, 255, 255]];
// Bounds after transforms.
let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
const moved = layers.map(l => {
  const p = new Float64Array(l.count * 3);
  for (let i = 0; i < l.count; i++) {
    const x = l.xyz[i * 3], y = l.xyz[i * 3 + 1], z = l.xyz[i * 3 + 2], T = l.T;
    p[i * 3] = T ? T[0] * x + T[1] * y + T[2] * z + T[3] : x;
    p[i * 3 + 1] = T ? T[4] * x + T[5] * y + T[6] * z + T[7] : y;
    p[i * 3 + 2] = T ? T[8] * x + T[9] * y + T[10] * z + T[11] : z;
    if (p[i * 3] < minx) minx = p[i * 3]; if (p[i * 3] > maxx) maxx = p[i * 3]; if (p[i * 3 + 1] < miny) miny = p[i * 3 + 1]; if (p[i * 3 + 1] > maxy) maxy = p[i * 3 + 1];
  }
  return p;
});
const W = Math.min(4000, Math.ceil((maxx - minx) / res) + 1), H = Math.min(4000, Math.ceil((maxy - miny) / res) + 1);
const img = new Uint8Array(W * H * 3), top = new Float32Array(W * H).fill(-Infinity);
layers.forEach((l, li) => {
  const p = moved[li], tint = colour ? [255, 255, 255] : TINTS[li % TINTS.length];
  let zLimit = Infinity;
  if (ground) { const zs = Float64Array.from({ length: Math.min(l.count, 50000) }, (_, q) => p[Math.floor(q * l.count / Math.min(l.count, 50000)) * 3 + 2]).sort(); zLimit = zs[Math.floor(zs.length * 0.05)] + 2.2; }
  for (let i = 0; i < l.count; i++) {
    const c = Math.floor((p[i * 3] - minx) / res), r = H - 1 - Math.floor((p[i * 3 + 1] - miny) / res);
    if (c < 0 || r < 0 || c >= W || r >= H) continue;
    const k = r * W + c, z = p[i * 3 + 2];
    if (z > zLimit || z <= top[k]) continue;
    top[k] = z;
    if (colour && l.rgb) { img[k * 3] = l.rgb[i * 3]; img[k * 3 + 1] = l.rgb[i * 3 + 1]; img[k * 3 + 2] = l.rgb[i * 3 + 2]; continue; }
    const b = l.rgb ? (l.rgb[i * 3] + l.rgb[i * 3 + 1] + l.rgb[i * 3 + 2]) / 3 / 255 : 0.6;
    img[k * 3] = tint[0] * (0.35 + 0.65 * b); img[k * 3 + 1] = tint[1] * (0.35 + 0.65 * b); img[k * 3 + 2] = tint[2] * (0.35 + 0.65 * b);
  }
});
// Reference map data on top: buildings white, footpath edges cyan, trees magenta.
if (referencePath) {
  const ref = JSON.parse(readFileSync(referencePath, "utf8")) as { buildings: [number, number][][]; footpaths: [number, number][][]; trees: [number, number][] };
  const zone = utmZoneFromEpsg(layers[0].epsg) ?? { zone: 55, south: true };
  const put = (e: number, n: number, rgb: number[], size = 0) => { for (let dc = -size; dc <= size; dc++) for (let dr = -size; dr <= size; dr++) { const c = Math.floor((e - minx) / res) + dc, r = H - 1 - Math.floor((n - miny) / res) + dr; if (c >= 0 && r >= 0 && c < W && r < H) { const k = (r * W + c) * 3; img[k] = rgb[0]; img[k + 1] = rgb[1]; img[k + 2] = rgb[2]; } } };
  const line = (rings: [number, number][][], rgb: number[]) => { for (const ring of rings) for (let i = 0; i + 1 < ring.length; i++) { const a = llToUtm(ring[i][1], ring[i][0], zone), b = llToUtm(ring[i + 1][1], ring[i + 1][0], zone); const L = Math.hypot(b.e - a.e, b.n - a.n), n = Math.max(2, Math.ceil(L / (res / 2))); for (let k = 0; k <= n; k++) put(a.e + (b.e - a.e) * k / n, a.n + (b.n - a.n) * k / n, rgb); } };
  line(ref.footpaths, [0, 220, 255]);
  line(ref.buildings, [255, 255, 255]);
  for (const [lon, lat] of ref.trees) { const u = llToUtm(lat, lon, zone); put(u.e, u.n, [255, 0, 255], 3); }
}
// PNG.
const rows = Buffer.alloc((W * 3 + 1) * H);
for (let r = 0; r < H; r++) { rows[r * (W * 3 + 1)] = 0; rows.set(img.subarray(r * W * 3, (r + 1) * W * 3), r * (W * 3 + 1) + 1); }
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
console.log(`wrote ${out}: ${W}x${H} px at ${res} m, ${layers.map((l, i) => `${l.name} = ${["red", "blue", "green", "yellow", "purple", "white"][i % 6]}`).join(", ")}`);
