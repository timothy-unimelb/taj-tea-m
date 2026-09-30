// Joins several georeferenced LAS scans of one site into a single LAS file,
// as if the whole site had been captured in one scan. The scans share map
// coordinates (UTM zone 55S from Scaniverse), so no alignment is needed.
// Phone altitude drifts between scans, so each scan is shifted up or down to
// match the ground of the scans before it where they overlap.
// Keeps the first file's header records (its map projection).
//
// Run: node data/test/merge-las.mjs out.las in1.las in2.las ...

import { readFileSync, writeFileSync } from "node:fs";

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length < 2) { console.error("Usage: node data/test/merge-las.mjs out.las in1.las in2.las ..."); process.exit(1); }

const scans = inputs.map(path => {
  const b = readFileSync(path), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const f64 = o => v.getFloat64(o, true);
  const s = { b, v, offset: v.getUint32(96, true), format: v.getUint8(104), recordLength: v.getUint16(105, true), count: v.getUint32(107, true),
    scale: [f64(131), f64(139), f64(147)], origin: [f64(155), f64(163), f64(171)], headerSize: v.getUint16(94, true) };
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== "LASF") throw new Error(`${path} is not a LAS file`);
  return s;
});
const first = scans[0];
if (scans.some(s => s.format !== first.format || s.recordLength !== first.recordLength)) throw new Error("The scans use different point formats.");

const total = scans.reduce((n, s) => n + s.count, 0);
const header = Buffer.from(first.b.subarray(0, first.offset)); // header and projection records
const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
const points = Buffer.alloc(total * first.recordLength);
const [sx, sy, sz] = first.scale, [ox, oy, oz] = first.origin;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const xyzOf = (s, i) => [0, 1, 2].map(k => s.v.getInt32(s.offset + i * s.recordLength + k * 4, true) * s.scale[k] + s.origin[k]);
// Lowest point in each 0.5 m cell: the ground.
const groundOf = s => { const g = new Map(); for (let i = 0; i < s.count; i++) { const [x, y, z] = xyzOf(s, i); const k = `${Math.floor(x * 2)},${Math.floor(y * 2)}`; if (!(g.get(k) <= z)) g.set(k, z); } return g; };
const merged = new Map();
let n = 0;
for (const s of scans) {
  const ground = groundOf(s), diffs = [];
  for (const [k, z] of ground) if (merged.has(k)) diffs.push(merged.get(k) - z);
  diffs.sort((a, b) => a - b);
  const dz = diffs.length >= 50 ? diffs[Math.floor(diffs.length / 2)] : 0;
  console.log(`shift ${dz.toFixed(3)} m from ${diffs.length} overlapping cells`);
  for (const [k, z] of ground) if (!(merged.get(k) <= z + dz)) merged.set(k, z + dz);
  for (let i = 0; i < s.count; i++) {
    const src = s.offset + i * s.recordLength, dst = n * first.recordLength;
    s.b.copy(points, dst, src, src + s.recordLength);
    // Re-express X, Y, Z against the first file's scale and origin.
    const xyz = xyzOf(s, i); xyz[2] += dz;
    points.writeInt32LE(Math.round((xyz[0] - ox) / sx), dst);
    points.writeInt32LE(Math.round((xyz[1] - oy) / sy), dst + 4);
    points.writeInt32LE(Math.round((xyz[2] - oz) / sz), dst + 8);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], xyz[k]); max[k] = Math.max(max[k], xyz[k]); }
    n++;
  }
}
hv.setUint32(107, total, true);
hv.setUint32(111, total, true); // all points as first returns
for (let r = 1; r < 5; r++) hv.setUint32(111 + r * 4, 0, true);
[[179, max[0]], [187, min[0]], [195, max[1]], [203, min[1]], [211, max[2]], [219, min[2]]].forEach(([o, x]) => hv.setFloat64(o, x, true));
writeFileSync(out, Buffer.concat([header, points]));
console.log(`wrote ${out}: ${total.toLocaleString()} points from ${inputs.length} scans, ${((header.length + points.length) / 1e6).toFixed(1)} MB`);
