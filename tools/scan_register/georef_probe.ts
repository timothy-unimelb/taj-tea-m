// Scores a known map placement of one scan with the map-fit measure, and shows what the
// placement search finds. For tuning the map placement.
// Run: node_modules/.bin/jiti tools/scan_register/georef_probe.ts scan.las reference.json yaw_deg tx ty
// yaw and shift are about the scan's feature centroid, in the scan's raw map frame.

import { readFileSync } from "node:fs";
import { utmZoneFromEpsg } from "../../lib/scan/geo";
import { placeSite, prepareReference, siteFeatures, type Reference } from "../../lib/scan/georef";
import { readLas } from "../../lib/scan/las";
import { identity4, localOrigin, prepareScan } from "../../lib/scan/register";
import { KdTree } from "../../lib/scan/kdtree";

const [scanPath, refPath, yawArg, txArg, tyArg] = process.argv.slice(2);
const cloud = readLas(readFileSync(scanPath).buffer.slice(0) as ArrayBuffer, scanPath.split("/").pop()!);
const zone = utmZoneFromEpsg(cloud.epsg)!;
const origin = localOrigin(cloud);
const prep = prepareScan(cloud, origin);
const F = siteFeatures([prep], [identity4()], [true]);
const R = prepareReference(JSON.parse(readFileSync(refPath, "utf8")) as Reference, zone, origin);
console.log(`features: ${F.walls.length / 2} walls, ${F.kerbs.length / 2} kerbs, ${F.poles.length / 2} poles; centroid (${F.cx.toFixed(1)}, ${F.cy.toFixed(1)}); reference: ${R.refB.length / 2} building pts, ${R.refK.length / 2} footpath pts, ${R.refT.length / 2} trees`);
const yaw = Number(yawArg) * Math.PI / 180, tx = Number(txArg), ty = Number(tyArg);
const c = Math.cos(yaw), s = Math.sin(yaw);
const dist = (P: Float32Array, tree: KdTree | null, trunc: number) => { if (!tree) return "n/a"; const d2 = new Float64Array(1); let sum = 0, near = 0, n = 0; for (let k = 0; k < P.length; k += 2) { const dx = P[k] - F.cx, dy = P[k + 1] - F.cy, x = c * dx - s * dy + F.cx + tx, y = s * dx + c * dy + F.cy + ty; const j = tree.nearest(x, y, 0, trunc, d2); const d = j < 0 ? trunc : Math.sqrt(d2[0]); sum += d; if (d < 0.3) near++; n++; } return `mean ${(sum / n).toFixed(2)} m, within 0.3 m ${(near / n).toFixed(2)}`; };
console.log(`at the given placement: walls to buildings ${dist(F.walls, R.tB, 1.5)}; kerbs to footpath edges ${dist(F.kerbs, R.tK, 1.0)}; poles to trees ${dist(F.poles, R.tP, 2.0)}`);
console.log(`at the phone placement: walls ${dist(F.walls, R.tB, 1.5)}`.replace("at the phone placement: walls " + dist(F.walls, R.tB, 1.5), ""));
const p = placeSite(F, R, m => console.log("  " + m));
console.log(`search result: applied ${p.applied}, ${p.yaw_deg} deg, ${p.shift_m} m, walls ${p.wall_fit}, kerb ${p.kerb_fit}, mean ${p.mean_distance_m}. ${p.note}`);

// Picture of the features against the map at the given placement: ground grey, walls red, poles yellow,
// buildings white, footpath edges cyan, council trees magenta. Written next to the reference as features.png.
{
  const { deflateSync } = await import("node:zlib");
  const { writeFileSync } = await import("node:fs");
  const res = 0.06, pad = 8;
  const rot = (x: number, y: number) => { const dx = x - F.cx, dy = y - F.cy; return [c * dx - s * dy + F.cx + tx, s * dx + c * dy + F.cy + ty]; };
  const minx = F.bbox[0] - pad, miny = F.bbox[1] - pad, W = Math.ceil((F.bbox[2] - F.bbox[0] + 2 * pad) / res), H = Math.ceil((F.bbox[3] - F.bbox[1] + 2 * pad) / res);
  const img = new Uint8Array(W * H * 3);
  const put = (x: number, y: number, rgb: number[], size = 0) => { for (let dc = -size; dc <= size; dc++) for (let dr = -size; dr <= size; dr++) { const col = Math.floor((x - minx) / res) + dc, row = H - 1 - Math.floor((y - miny) / res) + dr; if (col >= 0 && row >= 0 && col < W && row < H) { const k = (row * W + col) * 3; img[k] = rgb[0]; img[k + 1] = rgb[1]; img[k + 2] = rgb[2]; } } };
  for (let k = 0; k < prep.tgtIdx.length; k++) { const i = prep.tgtIdx[k]; if (Math.abs(prep.h[i]) < 0.3) { const [x, y] = rot(prep.x[i * 3], prep.x[i * 3 + 1]); put(x, y, [70, 70, 70]); } }
  for (let k = 0; k < R.refK.length; k += 2) put(R.refK[k], R.refK[k + 1], [0, 200, 255]);
  for (let k = 0; k < R.refB.length; k += 2) put(R.refB[k], R.refB[k + 1], [255, 255, 255]);
  for (let k = 0; k < F.walls.length; k += 2) { const [x, y] = rot(F.walls[k], F.walls[k + 1]); put(x, y, [255, 60, 60], 1); }
  for (let k = 0; k < F.poles.length; k += 2) { const [x, y] = rot(F.poles[k], F.poles[k + 1]); put(x, y, [255, 255, 0], 3); }
  for (let k = 0; k < R.refT.length; k += 2) put(R.refT[k], R.refT[k + 1], [255, 0, 255], 3);
  const rows = Buffer.alloc((W * 3 + 1) * H);
  for (let r = 0; r < H; r++) rows.set(img.subarray(r * W * 3, (r + 1) * W * 3), r * (W * 3 + 1) + 1);
  const crcTable = new Uint32Array(256).map((_, n) => { let v = n; for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1; return v >>> 0; });
  const crc = (b: Buffer) => { let v = 0xffffffff; for (const x of b) v = crcTable[(v ^ x) & 0xff] ^ (v >>> 8); return (v ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const out = refPath.replace(/[^/]+$/, "features.png");
  writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
  console.log(`wrote ${out} (${W}x${H})`);
}
