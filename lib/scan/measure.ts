// Measures a LiDAR scan of a street in the browser, so large files never
// leave the phone. Reads PLY (ASCII or binary) and LAS point clouds.
// Steps follow BRIEF.md "Scan measurement": find the ground, find the kerb
// (a step of about 60 to 300 mm), find obstacles 10 cm to 2.2 m above the
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

// `zUp` is set for formats whose third axis is always up (LAS).
type Cloud = { xyz: Float32Array; count: number; zUp?: boolean };

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

// LAS 1.0 to 1.4: X, Y, Z are the first three int32 of every point record. Z is up.
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
  return { xyz, count: n, zUp: true };
}

// ---------- Measurement ----------

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const midMean = (a: number[]) => { const s = [...a].sort((p, q) => p - q), m = s.slice(Math.floor(s.length / 4), Math.ceil(s.length * 3 / 4)); return m.reduce((x, y) => x + y, 0) / m.length; };

// The up axis is the one where most points share one 5 cm height band (the ground).
function findUp(c: Cloud) {
  if (c.zUp) return { axis: 2, sign: 1 };
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
  return { axis: best.axis, sign: above >= below ? 1 : -1 };
}

// Least squares line z = a + b*u through the given cells: the street's grade.
// Only along the street, so the kerb step across it survives.
function fitGrade(cells: { u: number; z: number }[]) {
  let n = 0, su = 0, sz = 0, suu = 0, suz = 0;
  for (const { u, z } of cells) { n++; su += u; sz += z; suu += u * u; suz += u * z; }
  const b = (n * suz - su * sz) / (n * suu - su * su);
  return { a: (sz - b * su) / n, b };
}

function measure(c: Cloud, file: string): ScanMeasurement {
  const notes: string[] = [];
  const up = findUp(c);
  const [a1, a2] = [0, 1, 2].filter(a => a !== up.axis);
  const z = new Float32Array(c.count), p = new Float32Array(c.count), q = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) { z[i] = c.xyz[i * 3 + up.axis] * up.sign; p[i] = c.xyz[i * 3 + a1]; q[i] = c.xyz[i * 3 + a2]; }

  // A phone scan is dense where the person walked and sparse spray further out.
  // Keep 10 cm cells with at least a quarter of the typical point count.
  let p0 = Infinity, q0 = Infinity, p1 = -Infinity, q1 = -Infinity;
  for (let i = 0; i < c.count; i++) { p0 = Math.min(p0, p[i]); q0 = Math.min(q0, q[i]); p1 = Math.max(p1, p[i]); q1 = Math.max(q1, q[i]); }
  const gw = Math.ceil((p1 - p0) / 0.1) + 1;
  const density = new Map<number, number>();
  const cellOf = (i: number) => Math.floor((q[i] - q0) / 0.1) * gw + Math.floor((p[i] - p0) / 0.1);
  for (let i = 0; i < c.count; i++) { const k = cellOf(i); density.set(k, (density.get(k) ?? 0) + 1); }
  const minDensity = Math.max(2, median([...density.values()]) / 4);
  const keep = new Uint8Array(c.count);
  for (let i = 0; i < c.count; i++) keep[i] = density.get(cellOf(i))! >= minDensity ? 1 : 0;

  // Direction along the street: the angle where the kerb step across it is sharpest.
  // (A phone scan is rarely walked in a straight line, so its shape can't be trusted.)
  let mp = 0, mq = 0, n = 0;
  for (let i = 0; i < c.count; i++) if (keep[i]) { mp += p[i]; mq += q[i]; n++; }
  mp /= n; mq /= n;
  const ground = new Map<string, { p: number; q: number; z: number }>();
  for (let i = 0; i < c.count; i++) {
    if (!keep[i]) continue;
    const key = `${Math.floor(p[i] / 0.2)},${Math.floor(q[i] / 0.2)}`;
    const cell = ground.get(key);
    if (!cell || z[i] < cell.z) ground.set(key, { p: p[i] - mp, q: q[i] - mq, z: z[i] });
  }
  const groundCells = [...ground.values()];
  let theta = 0, bestScore = -1;
  for (let deg = 0; deg < 180; deg += 3) {
    const t = deg * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
    const bins = new Map<number, number[]>();
    for (const g of groundCells) { const k = Math.floor((-g.p * st + g.q * ct) / 0.1); (bins.get(k) ?? bins.set(k, []).get(k)!).push(g.z); }
    const keys = [...bins.keys()].sort((x, y) => x - y);
    // Middle-half mean, not median: at a wrong angle a strip mixes footpath and road,
    // and a median of that mix jumps like a kerb while the mean blends smoothly.
    const med = new Map(keys.filter(k => bins.get(k)!.length >= 4).map(k => [k, midMean(bins.get(k)!)]));
    for (const k of keys) {
      // A kerb: flat ground on both sides of a sharp step. A slope seen at the wrong angle isn't flat.
      const b = [med.get(k - 4), med.get(k - 3), med.get(k - 2)], a = [med.get(k + 2), med.get(k + 3), med.get(k + 4)];
      if (b.some(x => x === undefined) || a.some(x => x === undefined)) continue;
      const [b0, b1, b2] = b as number[], [a0, a1, a2] = a as number[];
      if (Math.abs(b0 - b2) > 0.03 || Math.abs(a0 - a2) > 0.03) continue;
      const step = Math.abs(a1 - b1);
      if (step >= 0.06 && step <= 0.3 && step > bestScore) { bestScore = step; theta = t; }
    }
  }
  const [cu, su] = [Math.cos(theta), Math.sin(theta)];
  const u = new Float32Array(c.count), v = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) { const dp = p[i] - mp, dq = q[i] - mq; u[i] = dp * cu + dq * su; v[i] = -dp * su + dq * cu; }

  // Streets slope. Fit the grade to the lowest point of each 25 cm cell and
  // measure every height from it, dropping cells well off the fit (obstacles, spray).
  const lowCells = new Map<string, { u: number; v: number; z: number }>();
  for (let i = 0; i < c.count; i++) {
    if (!keep[i]) continue;
    const key = `${Math.floor(u[i] / 0.25)},${Math.floor(v[i] / 0.25)}`;
    const cell = lowCells.get(key);
    if (!cell || z[i] < cell.z) lowCells.set(key, { u: u[i], v: v[i], z: z[i] });
  }
  let cells = [...lowCells.values()];
  let grade = fitGrade(cells);
  for (let pass = 0; pass < 3; pass++) {
    const within = cells.filter(k => Math.abs(k.z - (grade.a + grade.b * k.u)) < 0.3);
    if (within.length < 20) break;
    grade = fitGrade(within); cells = within;
  }
  const h = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) h[i] = z[i] - (grade.a + grade.b * u[i]);

  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < c.count; i++) if (keep[i] && Math.abs(h[i]) < 0.3) { umin = Math.min(umin, u[i]); umax = Math.max(umax, u[i]); vmin = Math.min(vmin, v[i]); vmax = Math.max(vmax, v[i]); }
  const length = umax - umin;
  const nu = Math.max(1, Math.ceil(length / SLICE)), nv = Math.max(1, Math.ceil((vmax - vmin) / BIN));
  const cellIndex = (i: number) => {
    const iu = Math.floor((u[i] - umin) / SLICE), iv = Math.floor((v[i] - vmin) / BIN);
    return iu < 0 || iu >= nu || iv < 0 || iv >= nv ? -1 : iu * nv + iv;
  };
  // Per cell: lowest point (the ground there) and whether something stands on it.
  const low = new Float32Array(nu * nv).fill(Infinity);
  for (let i = 0; i < c.count; i++) { if (!keep[i]) continue; const k = cellIndex(i); if (k >= 0 && h[i] < low[k]) low[k] = h[i]; }
  const risers = new Uint16Array(nu * nv);
  for (let i = 0; i < c.count; i++) {
    if (!keep[i]) continue;
    const k = cellIndex(i); if (k < 0) continue;
    const rise = h[i] - low[k];
    if (rise > 0.1 && rise < 2.2 && low[k] < 0.4) risers[k]++;
  }
  const blocked = new Uint8Array(nu * nv);
  for (let k = 0; k < nu * nv; k++) blocked[k] = risers[k] >= 3 ? 1 : 0;

  // Ground profile across the street, then the kerb: the biggest step of 6 to 30 cm.
  const profile: number[] = [];
  for (let iv = 0; iv < nv; iv++) {
    const col: number[] = [];
    for (let iu = 0; iu < nu; iu++) { const g = low[iu * nv + iv]; if (g < 0.4 && !blocked[iu * nv + iv]) col.push(g); }
    profile.push(col.length >= 3 ? median(col) : NaN);
  }
  // A kerb has about 0.8 m of well-scanned, flat ground on each side. That rules
  // out small steps at the ragged edge of a scan.
  let kerb = -1, kerbStep = 0;
  const band = (from: number, to: number) => profile.slice(Math.max(0, from), Math.max(0, to)).filter(Number.isFinite);
  for (let iv = 10; iv < nv - 10; iv++) {
    const near0 = band(iv - 5, iv - 1), far0 = band(iv - 10, iv - 5), near1 = band(iv + 2, iv + 6), far1 = band(iv + 6, iv + 11);
    if (near0.length < 3 || far0.length < 3 || near1.length < 3 || far1.length < 3) continue;
    if (Math.abs(median(near0) - median(far0)) > 0.05 || Math.abs(median(near1) - median(far1)) > 0.05) continue;
    const step = median([...near1, ...far1]) - median([...near0, ...far0]);
    if (Math.abs(step) >= 0.06 && Math.abs(step) <= 0.3 && Math.abs(step) > Math.abs(kerbStep)) { kerb = iv; kerbStep = step; }
  }
  const kerbFound = kerb >= 0;
  if (!kerbFound) notes.push("No kerb step found. The scan may not reach from the footpath to the road.");
  // Footpath is the higher side of the kerb.
  const footDir = kerbStep > 0 ? 1 : -1;
  const side = (iv: number) => (iv - kerb) * footDir;
  const footLevel = kerbFound ? median(profile.filter((g, iv) => Number.isFinite(g) && side(iv) > 2 && side(iv) < 20)) : NaN;
  const roadLevel = kerbFound ? median(profile.filter((g, iv) => Number.isFinite(g) && side(iv) < -2 && side(iv) > -20)) : NaN;

  let footpath: ScanMeasurement["footpath"] = null;
  let roadFromKerb: number | null = null;
  const obstacles: Obstacle[] = [];
  if (kerbFound) {
    const widths: { w: number; at: number; seen: number; iu: number }[] = []; const roads: number[] = [];
    for (let iu = 0; iu < nu; iu++) {
      // Longest run of free footpath in this slice. One empty 10 cm bin (a scan gap) doesn't break a run.
      let run = 0, gap = 0, bestRun = 0, seen = 0;
      for (let iv = kerb + 2 * footDir; iv >= 0 && iv < nv; iv += footDir) {
        const k = iu * nv + iv, g = low[k];
        if (!(g < 0.4)) { if (run > 0 && gap === 0) { gap = 1; continue; } run = 0; gap = 0; continue; }
        seen++;
        // On the raised side of the kerb and not stepped up onto something. Allows crossfall.
        const free = !blocked[k] && g > (footLevel + roadLevel) / 2 && g < footLevel + 0.2;
        if (free) { run += 1 + gap; gap = 0; } else { run = 0; gap = 0; }
        bestRun = Math.max(bestRun, run);
      }
      // Only slices where the footpath was actually scanned count.
      if (seen >= 10) widths.push({ w: (bestRun + 1) * BIN, at: iu * SLICE, seen, iu });
      // Flat road from the kerb outward, until a raised edge, an obstacle or the scan's reach.
      let r = 2;
      for (let iv = kerb - 2 * footDir; iv >= 0 && iv < nv; iv -= footDir) {
        const k = iu * nv + iv, g = low[k];
        if (!(g < 0.4) || blocked[k] || g > (footLevel + roadLevel) / 2 || g < roadLevel - 0.2) break;
        r++;
      }
      if (r > 2) roads.push(r * BIN);
    }
    // Trust well-scanned slices away from the ragged ends, and count a pinch
    // only when it holds for two slices in a row (1 m), not a one-slice scan gap.
    const typicalSeen = median(widths.map(x => x.seen));
    const good = widths.filter(x => x.seen >= 0.6 * typicalSeen && x.iu >= 2 && x.iu < nu - 2);
    let narrowest = good[0];
    for (let i = 0; i + 1 < good.length; i++) {
      if (good[i + 1].iu !== good[i].iu + 1) continue;
      const w = Math.max(good[i].w, good[i + 1].w);
      if (!narrowest || w < narrowest.w) narrowest = { ...good[i], w };
    }
    if (good.length >= 4 && narrowest) footpath = { min_clear_m: round(narrowest.w, 1), median_clear_m: round(median(good.map(x => x.w)), 1), narrowest_at_m: round(narrowest.at, 1) };
    else notes.push("The footpath side of the kerb has too few points to measure a width.");
    if (roads.length) roadFromKerb = round(median(roads), 1);

    // Obstacles on the footpath: joined blocked cells. Columns blocked along
    // most of the scan are the kerb face or the building line, not obstacles.
    const seenCell = new Uint8Array(nu * nv);
    for (let iv = 0; iv < nv; iv++) {
      let count = 0;
      for (let iu = 0; iu < nu; iu++) count += blocked[iu * nv + iv];
      if (count > 0.7 * nu || Math.abs(iv - kerb) <= 1) for (let iu = 0; iu < nu; iu++) seenCell[iu * nv + iv] = 1;
    }
    const tops = new Float32Array(nu * nv).fill(-Infinity);
    for (let i = 0; i < c.count; i++) { if (!keep[i]) continue; const k = cellIndex(i); if (k >= 0 && h[i] - low[k] < 2.2) tops[k] = Math.max(tops[k], h[i]); }
    for (let s = 0; s < nu * nv; s++) {
      if (!blocked[s] || seenCell[s] || side(s % nv) <= 0) continue;
      const stack = [s]; seenCell[s] = 1;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, top = 0;
      while (stack.length) {
        const k = stack.pop()!, iu = Math.floor(k / nv), iv = k % nv;
        u0 = Math.min(u0, iu); u1 = Math.max(u1, iu); v0 = Math.min(v0, iv); v1 = Math.max(v1, iv);
        top = Math.max(top, tops[k] - footLevel);
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ju = iu + du, jv = iv + dv, j = ju * nv + jv;
          if (ju >= 0 && ju < nu && jv >= 0 && jv < nv && blocked[j] && !seenCell[j] && side(jv) > 0) { seenCell[j] = 1; stack.push(j); }
        }
      }
      const along = (u1 - u0 + 1) * SLICE, across = (v1 - v0 + 1) * BIN;
      const nearEdge = footDir > 0 ? v0 : v1;
      // Skip the building line, noise, and anything beyond the footpath or bigger than street furniture.
      const fromKerb = Math.abs(nearEdge - kerb) * BIN, pathWidth = footpath?.median_clear_m ?? 3;
      if (along > 0.7 * length || top < 0.15 || across > 3 || along > 6 || fromKerb > pathWidth + 0.5) continue;
      obstacles.push({ along_m: round(u0 * SLICE, 1), from_kerb_m: round(fromKerb, 1), width_m: round(across, 1), length_m: round(along, 1), height_m: round(top, 1) });
    }
    // Keep the biggest obstacles, listed along the street.
    obstacles.sort((a, b) => b.height_m * b.width_m * b.length_m - a.height_m * a.width_m * a.length_m);
  }
  if (length < 2) notes.push("The scan covers less than 2 m of street.");
  // Real phone scans are noisy. Report widths only when they look like a street:
  // a kerb of 6 to 25 cm and a typical footpath of at least 1.5 m. Otherwise say so.
  const kerbHeight = kerbFound ? Math.abs(footLevel - roadLevel) : NaN;
  if (kerbFound && (!(kerbHeight >= 0.06 && kerbHeight <= 0.25) || !footpath || footpath.median_clear_m < 1.5)) {
    notes.push("Footpath widths could not be measured reliably from this scan. Check them on site.");
    footpath = null; roadFromKerb = null; obstacles.length = 0;
  }
  return {
    file, points: c.count, length_m: round(length, 1), kerb_found: kerbFound,
    kerb_height_m: kerbFound ? round(Math.abs(footLevel - roadLevel), 2) : null,
    footpath, road_from_kerb_m: roadFromKerb, obstacles: obstacles.slice(0, 12).sort((a, b) => a.along_m - b.along_m), notes,
  };
}

// A scan covers the site when it holds enough street to measure and shows the kerb.
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
