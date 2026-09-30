// Turns the scans a planner uploads into one site scan, in the browser.
//
// This is the hook for the team's point cloud registration (Tamara). Replace
// the body of `stitchScans` with the real registration; the rest of the app
// only needs one File back.
//
// Until then: one scan passes straight through. Several georeferenced LAS
// scans are joined by their map coordinates, with each scan's height levelled
// to the scans before it where they overlap (phone altitude drifts). Rotation
// and position errors between scans are NOT corrected. Several PLY scans have
// no shared coordinates, so they are joined as they are.

import { readPlyPoints } from "./measure";

export async function stitchScans(files: File[]): Promise<File> {
  if (files.length === 1) return files[0];
  const names = files.map(f => f.name.toLowerCase());
  if (names.every(n => n.endsWith(".las"))) return joinLas(files);
  if (names.every(n => n.endsWith(".ply"))) return joinPly(files);
  throw new Error("Upload all scans in one format: all LAS or all PLY.");
}

type Las = { v: DataView; bytes: Uint8Array; offset: number; format: number; recordLength: number; count: number; scale: number[]; origin: number[] };

function readLasHeader(buffer: ArrayBuffer, name: string): Las {
  const v = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "LASF") throw new Error(`${name} is not a LAS file.`);
  const f64 = (o: number) => v.getFloat64(o, true);
  let count = v.getUint32(107, true);
  if (!count && buffer.byteLength > 255) count = Number(v.getBigUint64(247, true));
  return { v, bytes, offset: v.getUint32(96, true), format: v.getUint8(104), recordLength: v.getUint16(105, true), count, scale: [f64(131), f64(139), f64(147)], origin: [f64(155), f64(163), f64(171)] };
}

async function joinLas(files: File[]): Promise<File> {
  const scans = await Promise.all(files.map(async f => readLasHeader(await f.arrayBuffer(), f.name)));
  const first = scans[0];
  if (scans.some(s => s.format !== first.format || s.recordLength !== first.recordLength)) throw new Error("These scans use different LAS point formats, so they can't be joined.");
  const xyz = (s: Las, i: number) => [0, 1, 2].map(k => s.v.getInt32(s.offset + i * s.recordLength + k * 4, true) * s.scale[k] + s.origin[k]);
  // Lowest point in each 0.5 m cell: the ground.
  const groundOf = (s: Las) => {
    const g = new Map<string, number>();
    for (let i = 0; i < s.count; i++) { const [x, y, z] = xyz(s, i); const k = `${Math.floor(x * 2)},${Math.floor(y * 2)}`; const cur = g.get(k); if (cur === undefined || z < cur) g.set(k, z); }
    return g;
  };
  const total = scans.reduce((n, s) => n + s.count, 0);
  const header = first.bytes.slice(0, first.offset); // header and map projection records
  const hv = new DataView(header.buffer);
  const points = new Uint8Array(total * first.recordLength), pv = new DataView(points.buffer);
  const [sx, sy, sz] = first.scale, [ox, oy, oz] = first.origin;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const merged = new Map<string, number>();
  let n = 0;
  for (const s of scans) {
    const ground = groundOf(s), diffs: number[] = [];
    for (const [k, z] of ground) { const m = merged.get(k); if (m !== undefined) diffs.push(m - z); }
    diffs.sort((a, b) => a - b);
    const dz = diffs.length >= 50 ? diffs[Math.floor(diffs.length / 2)] : 0;
    for (const [k, z] of ground) { const m = merged.get(k); if (m === undefined || z + dz < m) merged.set(k, z + dz); }
    for (let i = 0; i < s.count; i++) {
      const src = s.offset + i * s.recordLength, dst = n * first.recordLength;
      points.set(s.bytes.subarray(src, src + s.recordLength), dst);
      const p = xyz(s, i); p[2] += dz;
      pv.setInt32(dst, Math.round((p[0] - ox) / sx), true);
      pv.setInt32(dst + 4, Math.round((p[1] - oy) / sy), true);
      pv.setInt32(dst + 8, Math.round((p[2] - oz) / sz), true);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      n++;
    }
  }
  hv.setUint32(107, total, true);
  hv.setUint32(111, total, true); // all points as first returns
  for (let r = 1; r < 5; r++) hv.setUint32(111 + r * 4, 0, true);
  ([[179, max[0]], [187, min[0]], [195, max[1]], [203, min[1]], [211, max[2]], [219, min[2]]] as const).forEach(([o, x]) => hv.setFloat64(o, x, true));
  return new File([header, points], "site-scan-stitched.las", { type: "application/octet-stream" });
}

// PLY scans carry no shared map coordinates, so their vertices are simply joined (x, y, z only).
async function joinPly(files: File[]): Promise<File> {
  const clouds: Float32Array[] = [];
  for (const f of files) {
    const pts = readPlyPoints(await f.arrayBuffer());
    if (!pts) throw new Error(`${f.name} can't be read as a PLY scan.`);
    clouds.push(pts);
  }
  const count = clouds.reduce((n, c) => n + c.length / 3, 0);
  const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`);
  const body = new Float32Array(count * 3);
  let o = 0;
  for (const c of clouds) { body.set(c, o); o += c.length; }
  return new File([header, body], "site-scan-stitched.ply", { type: "application/octet-stream" });
}
