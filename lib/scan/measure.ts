// Measures a LiDAR scan of a street in the browser, so large files never
// leave the phone. Reads PLY (ASCII or binary) and LAS point clouds.
// Steps follow BRIEF.md "Scan measurement": find the ground, find the kerb
// (a step of about 60 to 300 mm), find obstacles 5 cm to 2.2 m above the
// ground, slice across the street every 0.5 m and measure clear widths.
// Code makes every number. Claude only reads them (app/api/site-check).

export type Obstacle = {
  along_m: number;       // distance along the scan from its start
  from_kerb_m: number;   // distance back from the kerb face, on the footpath side
  width_m: number;       // across the footpath
  length_m: number;      // along the footpath
  height_m: number;
};

export type ScanMeasurement = {
  file: string;
  points: number;
  length_m: number;
  kerb_found: boolean;
  kerb_height_m: number | null;
  footpath: { min_clear_m: number; median_clear_m: number; narrowest_at_m: number } | null;
  road_from_kerb_m: number | null;       // flat road next to the kerb, up to the first raised edge or the scan's reach
  obstacles: Obstacle[];
  notes: string[];
};

type Cloud = { xyz: Float32Array; count: number };

const MAX_POINTS = 600_000;
const SLICE = 0.5, BIN = 0.1;

export async function measureScan(file: File): Promise<ScanMeasurement> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  const cloud = name.endsWith(".las") ? readLas(buffer) : name.endsWith(".ply") ? readPly(buffer) : null;
  if (!cloud) throw new Error(`${file.name}: export the scan as PLY or LAS. E57 and ZIP can't be read yet.`);
  if (cloud.count < 500) throw new Error(`${file.name}: the file has too few points to measure.`);
  return measure(cloud, file.name);
}

// ---------- Readers ----------

const PLY_TYPES: Record<string, [number, (v: DataView, o: number) => number]> = {
  char: [1, (v, o) => v.getInt8(o)], int8: [1, (v, o) => v.getInt8(o)],
  uchar: [1, (v, o) => v.getUint8(o)], uint8: [1, (v, o) => v.getUint8(o)],
  short: [2, (v, o) => v.getInt16(o, true)], int16: [2, (v, o) => v.getInt16(o, true)],
  ushort: [2, (v, o) => v.getUint16(o, true)], uint16: [2, (v, o) => v.getUint16(o, true)],
  int: [4, (v, o) => v.getInt32(o, true)], int32: [4, (v, o) => v.getInt32(o, true)],
  uint: [4, (v, o) => v.getUint32(o, true)], uint32: [4, (v, o) => v.getUint32(o, true)],
  float: [4, (v, o) => v.getFloat32(o, true)], float32: [4, (v, o) => v.getFloat32(o, true)],
  double: [8, (v, o) => v.getFloat64(o, true)], float64: [8, (v, o) => v.getFloat64(o, true)],
};

function readPly(buffer: ArrayBuffer): Cloud | null {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536)));
  const end = head.indexOf("end_header");
  if (!head.startsWith("ply") || end < 0) return null;
  const headerBytes = end + "end_header".length + (head[end + 10] === "\r" ? 2 : 1);
  const lines = head.slice(0, end).split(/\r?\n/);
  const format = lines.find(l => l.startsWith("format"))?.split(/\s+/)[1];
  // Elements before "vertex" (rare) are not supported; Scaniverse writes vertex first.
  let count = 0, inVertex = false;
  const props: { name: string; type: string }[] = [];
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p[0] === "element") { inVertex = p[1] === "vertex"; if (inVertex) count = Number(p[2]); }
    else if (p[0] === "property" && inVertex && p[1] !== "list") props.push({ type: p[1], name: p[2] });
  }
  const ix = props.findIndex(p => p.name === "x"), iy = props.findIndex(p => p.name === "y"), iz = props.findIndex(p => p.name === "z");
  if (!count || ix < 0 || iy < 0 || iz < 0) return null;
  const step = Math.max(1, Math.ceil(count / MAX_POINTS));
  const xyz = new Float32Array(Math.ceil(count / step) * 3);
  let n = 0;
  if (format === "ascii") {
    const body = new TextDecoder().decode(new Uint8Array(buffer, headerBytes)).split(/\r?\n/);
    for (let i = 0; i < count && i < body.length; i += step) {
      const v = body[i].trim().split(/\s+/);
      xyz[n * 3] = +v[ix]; xyz[n * 3 + 1] = +v[iy]; xyz[n * 3 + 2] = +v[iz]; n++;
    }
  } else if (format === "binary_little_endian") {
    const offsets: number[] = []; let stride = 0;
    for (const p of props) { const t = PLY_TYPES[p.type]; if (!t) return null; offsets.push(stride); stride += t[0]; }
    const view = new DataView(buffer, headerBytes);
    const get = (i: number) => PLY_TYPES[props[i].type][1];
    const [gx, gy, gz] = [get(ix), get(iy), get(iz)];
    for (let i = 0; i < count; i += step) {
      const o = i * stride;
      if (o + stride > view.byteLength) break;
      xyz[n * 3] = gx(view, o + offsets[ix]); xyz[n * 3 + 1] = gy(view, o + offsets[iy]); xyz[n * 3 + 2] = gz(view, o + offsets[iz]); n++;
    }
  } else return null;
  return { xyz, count: n };
}

// LAS 1.0 to 1.4: X, Y, Z are the first three int32 of every point record.
function readLas(buffer: ArrayBuffer): Cloud | null {
  const v = new DataView(buffer);
  if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== "LASF") return null;
  const offset = v.getUint32(96, true), recordLength = v.getUint16(105, true);
  let count = v.getUint32(107, true);
  if (!count && buffer.byteLength > 255) count = Number(v.getBigUint64(247, true));
  const sx = v.getFloat64(131, true), sy = v.getFloat64(139, true), sz = v.getFloat64(147, true);
  const oz = v.getFloat64(171, true);
  const step = Math.max(1, Math.ceil(count / MAX_POINTS));
  const xyz = new Float32Array(Math.ceil(count / step) * 3);
  let n = 0;
  // Subtract the first point so float32 keeps millimetres at map coordinates.
  const bx = v.getInt32(offset, true) * sx, by = v.getInt32(offset + 4, true) * sy;
  for (let i = 0; i < count; i += step) {
    const o = offset + i * recordLength;
    if (o + 12 > buffer.byteLength) break;
    xyz[n * 3] = v.getInt32(o, true) * sx - bx;
    xyz[n * 3 + 1] = v.getInt32(o + 4, true) * sy - by;
    xyz[n * 3 + 2] = v.getInt32(o + 8, true) * sz + oz;
    n++;
  }
  return { xyz, count: n };
}

// ---------- Measurement ----------

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// The ground is the densest flat level. The up axis is the one where most
// points share one 5 cm height band.
function findUp(c: Cloud) {
  let best = { axis: 1, peak: 0, share: 0 };
  for (let axis = 0; axis < 3; axis++) {
    const hist = new Map<number, number>();
    for (let i = 0; i < c.count; i++) { const k = Math.round(c.xyz[i * 3 + axis] / 0.05); hist.set(k, (hist.get(k) ?? 0) + 1); }
    let peakK = 0, peakN = 0;
    for (const [k, n] of hist) if (n > peakN) { peakN = n; peakK = k; }
    if (peakN / c.count > best.share) best = { axis, peak: peakK * 0.05, share: peakN / c.count };
  }
  // Up points away from the ground, towards where the obstacles are.
  let above = 0, below = 0;
  for (let i = 0; i < c.count; i++) { const h = c.xyz[i * 3 + best.axis] - best.peak; if (h > 0.3) above++; else if (h < -0.3) below++; }
  return { axis: best.axis, sign: above >= below ? 1 : -1, ground: best.peak };
}

function measure(c: Cloud, file: string): ScanMeasurement {
  const notes: string[] = [];
  const up = findUp(c);
  const [a1, a2] = [0, 1, 2].filter(a => a !== up.axis);
  const h = new Float32Array(c.count), p = new Float32Array(c.count), q = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) {
    h[i] = (c.xyz[i * 3 + up.axis] - up.ground) * up.sign;
    p[i] = c.xyz[i * 3 + a1]; q[i] = c.xyz[i * 3 + a2];
  }
  // Direction along the street: the long axis of the ground points (PCA).
  let mp = 0, mq = 0, n = 0;
  for (let i = 0; i < c.count; i++) if (Math.abs(h[i]) < 0.35) { mp += p[i]; mq += q[i]; n++; }
  mp /= n; mq /= n;
  let spp = 0, sqq = 0, spq = 0;
  for (let i = 0; i < c.count; i++) if (Math.abs(h[i]) < 0.35) { const dp = p[i] - mp, dq = q[i] - mq; spp += dp * dp; sqq += dq * dq; spq += dp * dq; }
  const theta = 0.5 * Math.atan2(2 * spq, spp - sqq);
  const [cu, su] = [Math.cos(theta), Math.sin(theta)];
  const u = new Float32Array(c.count), v = new Float32Array(c.count);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < c.count; i++) {
    const dp = p[i] - mp, dq = q[i] - mq;
    u[i] = dp * cu + dq * su; v[i] = -dp * su + dq * cu;
    if (Math.abs(h[i]) < 0.35) { umin = Math.min(umin, u[i]); umax = Math.max(umax, u[i]); vmin = Math.min(vmin, v[i]); vmax = Math.max(vmax, v[i]); }
  }
  const length = umax - umin;
  const nu = Math.max(1, Math.ceil(length / SLICE)), nv = Math.max(1, Math.ceil((vmax - vmin) / BIN));
  // Per cell: lowest point (the ground there) and whether anything stands on it.
  const low = new Float32Array(nu * nv).fill(Infinity);
  for (let i = 0; i < c.count; i++) {
    const iu = Math.floor((u[i] - umin) / SLICE), iv = Math.floor((v[i] - vmin) / BIN);
    if (iu < 0 || iu >= nu || iv < 0 || iv >= nv) continue;
    const k = iu * nv + iv;
    if (h[i] < low[k]) low[k] = h[i];
  }
  const blocked = new Uint8Array(nu * nv);
  for (let i = 0; i < c.count; i++) {
    const iu = Math.floor((u[i] - umin) / SLICE), iv = Math.floor((v[i] - vmin) / BIN);
    if (iu < 0 || iu >= nu || iv < 0 || iv >= nv) continue;
    const k = iu * nv + iv, rise = h[i] - low[k];
    if (rise > 0.05 && rise < 2.2 && low[k] < 0.4) blocked[k] = 1;
  }

  // Ground profile across the street, then the kerb: the biggest step of 6 to 30 cm.
  const profile: number[] = [];
  for (let iv = 0; iv < nv; iv++) { const col: number[] = []; for (let iu = 0; iu < nu; iu++) { const g = low[iu * nv + iv]; if (g < 0.4 && !blocked[iu * nv + iv]) col.push(g); } profile.push(col.length ? median(col) : NaN); }
  let kerb = -1, kerbStep = 0;
  for (let iv = 2; iv < nv - 2; iv++) {
    const before = median([profile[iv - 2], profile[iv - 1]].filter(Number.isFinite));
    const after = median([profile[iv + 1], profile[iv + 2]].filter(Number.isFinite));
    const step = after - before;
    if (Math.abs(step) >= 0.06 && Math.abs(step) <= 0.3 && Math.abs(step) > Math.abs(kerbStep)) { kerb = iv; kerbStep = step; }
  }
  const kerbFound = kerb >= 0;
  if (!kerbFound) notes.push("No kerb step found. The scan may not reach from the footpath to the road.");
  // Footpath is the higher side of the kerb.
  const footDir = kerbStep > 0 ? 1 : -1;
  const footLevel = kerbFound ? median(profile.filter((g, iv) => Number.isFinite(g) && (iv - kerb) * footDir > 1)) : NaN;
  const roadLevel = kerbFound ? median(profile.filter((g, iv) => Number.isFinite(g) && (iv - kerb) * footDir < -1)) : NaN;

  let footpath: ScanMeasurement["footpath"] = null;
  let roadFromKerb: number | null = null;
  const obstacles: Obstacle[] = [];
  if (kerbFound) {
    const widths: number[] = []; const roads: number[] = [];
    let narrowest = { w: Infinity, at: 0 };
    for (let iu = 0; iu < nu; iu++) {
      // Longest run of free footpath cells in this slice.
      let run = 0, bestRun = 0, seen = 0;
      for (let iv = kerb + footDir; iv >= 0 && iv < nv; iv += footDir) {
        const k = iu * nv + iv, g = low[k];
        if (g < 0.4) seen++;
        const free = g < 0.4 && !blocked[k] && Math.abs(g - footLevel) < 0.06;
        run = free ? run + 1 : 0; bestRun = Math.max(bestRun, run);
      }
      if (seen >= 5) { const w = bestRun * BIN; widths.push(w); if (w < narrowest.w) narrowest = { w, at: iu * SLICE }; }
      // Flat road from the kerb outward, until a raised edge, an obstacle or the scan's reach.
      // Starts two bins out, past the kerb face.
      let r = 2;
      for (let iv = kerb - 2 * footDir; iv >= 0 && iv < nv; iv -= footDir) {
        const k = iu * nv + iv, g = low[k];
        if (!(g < 0.4) || blocked[k] || Math.abs(g - roadLevel) > 0.05) break;
        r++;
      }
      if (r > 2) roads.push(r * BIN);
    }
    if (widths.length) footpath = { min_clear_m: round(narrowest.w, 1), median_clear_m: round(median(widths), 1), narrowest_at_m: round(narrowest.at, 1) };
    if (roads.length) roadFromKerb = round(median(roads), 1);

    // Obstacles on the footpath: joined blocked cells. Columns blocked along
    // most of the scan are the kerb face or the building line, not obstacles.
    const seenCell = new Uint8Array(nu * nv);
    for (let iv = 0; iv < nv; iv++) {
      let count = 0;
      for (let iu = 0; iu < nu; iu++) count += blocked[iu * nv + iv];
      if (count > 0.7 * nu || Math.abs(iv - kerb) <= 1) for (let iu = 0; iu < nu; iu++) seenCell[iu * nv + iv] = 1;
    }
    for (let s = 0; s < nu * nv; s++) {
      const iv0 = s % nv;
      if (!blocked[s] || seenCell[s] || (iv0 - kerb) * footDir <= 0) continue;
      const stack = [s]; seenCell[s] = 1;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, top = 0;
      while (stack.length) {
        const k = stack.pop()!, iu = Math.floor(k / nv), iv = k % nv;
        u0 = Math.min(u0, iu); u1 = Math.max(u1, iu); v0 = Math.min(v0, iv); v1 = Math.max(v1, iv);
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ju = iu + du, jv = iv + dv, j = ju * nv + jv;
          if (ju >= 0 && ju < nu && jv >= 0 && jv < nv && blocked[j] && !seenCell[j] && (jv - kerb) * footDir > 0) { seenCell[j] = 1; stack.push(j); }
        }
      }
      const along = (u1 - u0 + 1) * SLICE, across = (v1 - v0 + 1) * BIN;
      if (along > 0.7 * length) continue; // building line or fence along the whole scan
      for (let i = 0; i < c.count; i++) {
        const iu = Math.floor((u[i] - umin) / SLICE), iv = Math.floor((v[i] - vmin) / BIN);
        if (iu >= u0 && iu <= u1 && iv >= v0 && iv <= v1) top = Math.max(top, h[i] - footLevel);
      }
      const nearEdge = footDir > 0 ? v0 : v1;
      obstacles.push({ along_m: round(u0 * SLICE, 1), from_kerb_m: round(Math.abs(nearEdge - kerb) * BIN, 1), width_m: round(across, 1), length_m: round(along, 1), height_m: round(top, 1) });
    }
    obstacles.sort((a, b) => a.along_m - b.along_m);
  }
  if (length < 2) notes.push("The scan covers less than 2 m of street.");
  return {
    file, points: c.count, length_m: round(length, 1), kerb_found: kerbFound,
    kerb_height_m: kerbFound ? round(Math.abs(footLevel - roadLevel), 2) : null,
    footpath, road_from_kerb_m: roadFromKerb, obstacles: obstacles.slice(0, 12), notes,
  };
}

// A scan covers its scan point when it holds enough street to measure and shows the kerb.
export function scanProblem(m: ScanMeasurement): string | null {
  if (m.points < 2000) return "Too few points to measure";
  if (m.length_m < 2) return "Covers less than 2 m of street";
  if (!m.kerb_found) return "Kerb not found in the scan";
  return null;
}

export function describeMeasurement(m: ScanMeasurement) {
  const parts = [`${m.length_m} m scanned`];
  if (m.kerb_height_m !== null) parts.push(`kerb ${Math.round(m.kerb_height_m * 1000)} mm`);
  if (m.footpath) parts.push(`footpath clear ${m.footpath.min_clear_m} m at its narrowest`);
  if (m.obstacles.length) parts.push(`${m.obstacles.length} obstacle${m.obstacles.length > 1 ? "s" : ""}`);
  return parts.join(", ");
}
