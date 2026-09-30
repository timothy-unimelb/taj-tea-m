// Places the registered site scan at its true map position, with no manual
// step. The phone's GPS puts the scan within about 10 to 20 m and 25 degrees.
// Reference map data fixes the rest: scanned walls are matched to mapped
// building faces, the scanned kerb to the road-side edge of mapped footpaths,
// and scanned trunks and poles to mapped street trees. A cross-correlation
// over heading and shift finds candidate placements, a 2D ICP refines each,
// and the best consistent one is applied. Without a good match the scan keeps
// its phone position and says so.

import { fft2Pair, ifft2Pair, mulConj, nextPow2 } from "./fft";
import { llToUtm, type UtmZone } from "./geo";
import { KdTree } from "./kdtree";
import { identity4, mul4, yawShift4, type Mat4, type Prep } from "./register";

export type Reference = {
  source: string;
  buildings: [number, number][][]; // building outlines as rings of [lon, lat]
  footpaths: [number, number][][]; // footpath outlines as rings of [lon, lat]
  trees: [number, number][];       // street trees as [lon, lat]
};

export type Placement = {
  applied: boolean;
  transform: Mat4;                 // extra transform in the local frame (identity if not applied)
  yaw_deg: number;
  shift_m: number;
  wall_fit: number | null;         // share of scanned wall points within 0.3 m of a mapped building face
  kerb_fit: number | null;         // share of scanned kerb points within 0.3 m of a mapped footpath edge
  mean_distance_m: number | null;  // mean truncated distance of scan features to the map
  runner_up_m: number | null;      // distance to the next-best placement, when one scored nearly as well
  note: string;
};

type Pts2 = Float32Array; // x, y pairs

function sampleRings(rings: [number, number][][], zone: UtmZone, origin: [number, number, number], step = 0.05): Pts2 {
  const out: number[] = [];
  for (const ring of rings) {
    const pts = ring.map(([lon, lat]) => { const u = llToUtm(lat, lon, zone); return [u.e - origin[0], u.n - origin[1]]; });
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L / step));
      for (let k = 0; k < n; k++) { const t = k / n; out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
    }
  }
  return Float32Array.from(out);
}

// Scanned features in the registered local frame, from the scans that were placed.
// Walls: tall vertical structures that reach from near the ground to above 2.5 m and run for
// at least 2.5 m (building faces, fences). Poles: compact tall structures (trunks with guards,
// poles, sign posts). Kerbs: height steps in the ground, kept for reporting only, since the
// council footpath polygons do not follow the kerb line.
export function siteFeatures(preps: Prep[], T: Mat4[], use: boolean[]): { walls: Pts2; kerbs: Pts2; poles: Pts2; cx: number; cy: number; bbox: [number, number, number, number] } {
  const p = [0, 0, 0], R = 0.1, RC = 0.15;
  const groundMin = new Map<number, number>();
  const cellMin = new Map<number, number>(), cellMax = new Map<number, number>(), cellCount = new Map<number, number>();
  let sx = 0, sy = 0, sn = 0;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const keyOf = (x: number, y: number, r: number) => (Math.floor(x / r) + 65536) * 131072 + (Math.floor(y / r) + 65536);
  preps.forEach((P, s) => {
    if (!use[s]) return;
    const M = T[s];
    for (let k = 0; k < P.tgtIdx.length; k++) {
      const i = P.tgtIdx[k], h = P.h[i];
      p[0] = M[0] * P.x[i * 3] + M[1] * P.x[i * 3 + 1] + M[2] * P.x[i * 3 + 2] + M[3];
      p[1] = M[4] * P.x[i * 3] + M[5] * P.x[i * 3 + 1] + M[6] * P.x[i * 3 + 2] + M[7];
      sx += p[0]; sy += p[1]; sn++;
      if (p[0] < bbox[0]) bbox[0] = p[0]; if (p[1] < bbox[1]) bbox[1] = p[1]; if (p[0] > bbox[2]) bbox[2] = p[0]; if (p[1] > bbox[3]) bbox[3] = p[1];
      if (h > 0.2 && h < 8) {
        const ck = keyOf(p[0], p[1], RC);
        cellCount.set(ck, (cellCount.get(ck) ?? 0) + 1);
        if (h < (cellMin.get(ck) ?? Infinity)) cellMin.set(ck, h);
        if (h > (cellMax.get(ck) ?? -Infinity)) cellMax.set(ck, h);
      }
      if (h > -0.5 && h < 0.5) {
        const key = keyOf(p[0], p[1], R), cur = groundMin.get(key);
        if (cur === undefined || h < cur) groundMin.set(key, h);
      }
    }
  });
  // Tall vertical cells, grouped into connected structures.
  const tall = new Set<number>();
  for (const [ck, n] of cellCount) if (n >= 4 && (cellMin.get(ck) ?? 9) < 1.0 && (cellMax.get(ck) ?? 0) > 1.8) tall.add(ck);
  const walls: number[] = [], poles: number[] = [], visited = new Set<number>();
  for (const start of tall) {
    if (visited.has(start)) continue;
    const stack = [start], cells: number[] = [];
    visited.add(start);
    while (stack.length) {
      const k = stack.pop()!; cells.push(k);
      const ix = Math.floor(k / 131072), iy = k % 131072;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nk = (ix + dx) * 131072 + (iy + dy); if (tall.has(nk) && !visited.has(nk)) { visited.add(nk); stack.push(nk); } }
    }
    const xs = cells.map(k => (Math.floor(k / 131072) - 65536 + 0.5) * RC), ys = cells.map(k => ((k % 131072) - 65536 + 0.5) * RC);
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (span >= 2.0) for (let i = 0; i < cells.length; i++) walls.push(xs[i], ys[i]);
    else if (cells.length <= 45) { poles.push(xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length); }
  }
  // Kerb edges: steps of 0.06 to 0.4 m per 10 cm in the ground height raster.
  const kerbs: number[] = [];
  for (const [key, h] of groundMin) {
    const ix = Math.floor(key / 131072) - 65536, iy = (key % 131072) - 65536;
    const e = groundMin.get((ix + 1 + 65536) * 131072 + (iy + 65536)), nn = groundMin.get((ix + 65536) * 131072 + (iy + 1 + 65536));
    const gx = e === undefined ? 0 : e - h, gy = nn === undefined ? 0 : nn - h, g = Math.hypot(gx, gy);
    if (g > 0.06 && g < 0.4) kerbs.push((ix + 0.5) * R, (iy + 0.5) * R);
  }
  return { walls: Float32Array.from(walls), kerbs: Float32Array.from(kerbs), poles: Float32Array.from(poles), cx: sx / sn, cy: sy / sn, bbox };
}

// Squared Euclidean distance transform of a grid (Felzenszwalb and Huttenlocher), in cells.
function distanceTransform(occupied: Uint8Array, n: number): Float64Array {
  const INF = 1e12, f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = occupied[i] ? 0 : INF;
  const pass = (get: (k: number) => number, set: (k: number, val: number) => void) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let i = 0; i < n; i++) pass(j => g[i * n + j], (j, val) => { g[i * n + j] = val; });
  for (let j = 0; j < n; j++) pass(i => g[i * n + j], (i, val) => { g[i * n + j] = val; });
  return g;
}

type Cand = { yaw: number; tx: number; ty: number; score: number };

function rasterCounts(P: Pts2, yaw: number, cx: number, cy: number, ox: number, oy: number, res: number, n: number): Float64Array {
  const out = new Float64Array(n * n), c = Math.cos(yaw), s = Math.sin(yaw);
  for (let k = 0; k < P.length; k += 2) {
    const dx = P[k] - cx, dy = P[k + 1] - cy, x = c * dx - s * dy + cx, y = s * dx + c * dy + cy;
    const i = Math.floor((x - ox) / res), j = Math.floor((y - oy) / res);
    if (i >= 0 && j >= 0 && i < n && j < n) out[i * n + j] += 1;
  }
  return out;
}

const W_WALL = 1.0, W_KERB = 0.0, W_POLE = 0.5;

// Mean truncated distance of the features to the map after a 2D transform, and the shares within 0.3 m.
function fitQuality(F: ReturnType<typeof siteFeatures>, refB: KdTree | null, refK: KdTree | null, refT: KdTree | null, yaw: number, tx: number, ty: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw), d2 = new Float64Array(1);
  const eval2 = (P: Pts2, tree: KdTree | null, trunc: number, sigma: number) => {
    if (!tree || !P.length) return null;
    let sum = 0, near = 0, kern = 0;
    for (let k = 0; k < P.length; k += 2) {
      const dx = P[k] - F.cx, dy = P[k + 1] - F.cy, x = c * dx - s * dy + F.cx + tx, y = s * dx + c * dy + F.cy + ty;
      const j = tree.nearest(x, y, 0, trunc, d2);
      const d = j < 0 ? trunc : Math.sqrt(d2[0]);
      sum += d; if (d < (sigma > 1 ? 0.8 : 0.3)) near++; kern += 1 - Math.exp(-(d * d) / (sigma * sigma));
    }
    return { mean: sum / (P.length / 2), near: near / (P.length / 2), cost: kern / (P.length / 2) };
  };
  const w = eval2(F.walls, refB, 1.5, 0.45), k = eval2(F.kerbs, refK, 1.0, 0.45), t = eval2(F.poles, refT, 2.0, 1.2);
  let num = 0, den = 0, cost = 0;
  if (w) { num += W_WALL * w.mean; den += W_WALL; cost += W_WALL * w.cost; }
  if (k && W_KERB) { num += W_KERB * k.mean; den += W_KERB; cost += W_KERB * k.cost; }
  if (t) { num += W_POLE * t.mean; den += W_POLE; cost += W_POLE * t.cost; }
  return { mean: den ? num / den : null, cost: den ? cost / den : null, wall: w?.near ?? null, kerb: k?.near ?? null, tree: t?.near ?? null };
}

// 2D point-to-point ICP of the features onto the reference, from a starting placement.
function icp2d(F: ReturnType<typeof siteFeatures>, refB: KdTree | null, refK: KdTree | null, refT: KdTree | null, start: Cand, iters = 40): Cand {
  let yaw = start.yaw, tx = start.tx, ty = start.ty;
  const d2 = new Float64Array(1);
  for (let it = 0; it < iters; it++) {
    const dLim = 2.0 + (0.3 - 2.0) * Math.min(1, it / (iters * 0.6)), c = Math.cos(yaw), s = Math.sin(yaw);
    let sxx = 0, sxy = 0, syx = 0, syy = 0, mx = 0, my = 0, qx = 0, qy = 0, W = 0;
    const pairs: number[] = [];
    const gather = (P: Pts2, tree: KdTree | null, w: number) => {
      if (!tree) return;
      for (let k = 0; k < P.length; k += 2) {
        const dx = P[k] - F.cx, dy = P[k + 1] - F.cy, x = c * dx - s * dy + F.cx + tx, y = s * dx + c * dy + F.cy + ty;
        const j = tree.nearest(x, y, 0, dLim, d2);
        if (j < 0) continue;
        pairs.push(x, y, tree["pts"][j * 3], tree["pts"][j * 3 + 1], w);
        mx += w * x; my += w * y; qx += w * tree["pts"][j * 3]; qy += w * tree["pts"][j * 3 + 1]; W += w;
      }
    };
    gather(F.walls, refB, W_WALL); if (W_KERB) gather(F.kerbs, refK, W_KERB); gather(F.poles, refT, W_POLE);
    if (W < 5) break;
    mx /= W; my /= W; qx /= W; qy /= W;
    for (let k = 0; k < pairs.length; k += 5) {
      const px = pairs[k] - mx, py = pairs[k + 1] - my, rx = pairs[k + 2] - qx, ry = pairs[k + 3] - qy, w = pairs[k + 4];
      sxx += w * px * rx; sxy += w * px * ry; syx += w * py * rx; syy += w * py * ry;
    }
    const dYaw = Math.atan2(sxy - syx, sxx + syy);
    // New placement: rotate the current placement by dYaw about the matched centroid, then move it onto the reference centroid.
    const cd = Math.cos(dYaw), sd = Math.sin(dYaw);
    const rc = [cd * (F.cx + tx - mx) - sd * (F.cy + ty - my) + mx, sd * (F.cx + tx - mx) + cd * (F.cy + ty - my) + my];
    const dtx = qx - mx, dty = qy - my;
    yaw += dYaw; tx = rc[0] + dtx - F.cx; ty = rc[1] + dty - F.cy;
    if (Math.abs(dYaw) < 1e-6 && Math.hypot(dtx, dty) < 1e-4) break;
  }
  return { yaw, tx, ty, score: 0 };
}

const treeOf = (P: Pts2) => P.length ? new KdTree(Float32Array.from({ length: P.length / 2 * 3 }, (_, i) => i % 3 === 2 ? 0 : P[Math.floor(i / 3) * 2 + (i % 3)]), P.length / 2) : null;

export type ReferencePrep = { refB: Pts2; refK: Pts2; refT: Pts2; tB: KdTree | null; tK: KdTree | null; tP: KdTree | null; source: string };

export function prepareReference(ref: Reference, zone: UtmZone, origin: [number, number, number]): ReferencePrep {
  const refB = sampleRings(ref.buildings, zone, origin), refK = sampleRings(ref.footpaths, zone, origin);
  const refT = Float32Array.from(ref.trees.flatMap(([lon, lat]) => { const u = llToUtm(lat, lon, zone); return [u.e - origin[0], u.n - origin[1]]; }));
  return { refB, refK, refT, tB: treeOf(refB), tK: treeOf(refK), tP: treeOf(refT), source: ref.source };
}

export function georeference(preps: Prep[], T: Mat4[], use: boolean[], origin: [number, number, number], zone: UtmZone, ref: Reference, log: (s: string) => void = () => {}, maxShift = 25, maxYaw = 35): Placement {
  return placeSite(siteFeatures(preps, T, use), prepareReference(ref, zone, origin), log, maxShift, maxYaw);
}

// How well a set of placements fits the map: the best placement's mean feature distance plus its phone-position prior. Lower is better.
export function mapScore(preps: Prep[], T: Mat4[], use: boolean[], R: ReferencePrep, log: (s: string) => void = () => {}): number | null {
  const p = placeSite(siteFeatures(preps, T, use), R, log, 25, 35);
  return p.mean_distance_m === null ? null : p.mean_distance_m + 0.3 * (p.shift_m / 15) ** 2 + 0.15 * (p.yaw_deg / 25) ** 2;
}

export function placeSite(F: ReturnType<typeof siteFeatures>, R: ReferencePrep, log: (s: string) => void = () => {}, maxShift = 25, maxYaw = 35): Placement {
  const none = (note: string): Placement => ({ applied: false, transform: identity4(), yaw_deg: 0, shift_m: 0, wall_fit: null, kerb_fit: null, mean_distance_m: null, runner_up_m: null, note });
  log(`site features: ${F.walls.length / 2} wall points, ${F.kerbs.length / 2} kerb points, ${F.poles.length / 2} poles or trunks`);
  const { refB, refK, refT, tB, tK, tP } = R;
  const ref = { source: R.source };
  if (refB.length < 20 && refK.length < 20) return none("No mapped buildings or footpaths near the site, so the scan keeps its phone position.");
  if (F.walls.length < 40 && F.poles.length < 6) return none("The scan shows too few walls or trees to match the map, so it keeps its phone position.");
  // Distance grids over the search area.
  const res = 0.25, pad = maxShift + 5;
  const lo = [F.bbox[0] - pad, F.bbox[1] - pad], span = Math.max(F.bbox[2] - F.bbox[0], F.bbox[3] - F.bbox[1]) + 2 * pad;
  const n = Math.min(1024, nextPow2(span / res)), r = span / n;
  const grid = (P: Pts2) => { const occ = new Uint8Array(n * n); for (let k = 0; k < P.length; k += 2) { const i = Math.floor((P[k] - lo[0]) / r), j = Math.floor((P[k + 1] - lo[1]) / r); if (i >= 0 && j >= 0 && i < n && j < n) occ[i * n + j] = 1; } return occ; };
  // Kernel grids: 1 on a line, falling off with distance; the search maximises their sum, expressed as a cost of 1 - kernel.
  const dt = (P: Pts2, sigma: number) => { const d = distanceTransform(grid(P), n); for (let k = 0; k < d.length; k++) d[k] = 1 - Math.exp(-(d[k] * r * r) / (sigma * sigma)); return d; };
  const DB = refB.length ? dt(refB, 0.45) : null, DK = refK.length ? dt(refK, 0.45) : null, DT = refT.length ? dt(refT, 1.2) : null;
  const [SB, SK] = fft2Pair(DB ?? new Float64Array(n * n), DK ?? new Float64Array(n * n), n), [ST] = fft2Pair(DT ?? new Float64Array(n * n), null, n);
  const nW = F.walls.length / 2, nK = F.kerbs.length / 2, nP = F.poles.length / 2;
  const wSum = (DB && nW ? W_WALL : 0) + (DK && nK ? W_KERB : 0) + (DT && nP ? W_POLE : 0) || 1;
  const lim = Math.floor(maxShift / r), cands: Cand[] = [];
  for (let yawDeg = -maxYaw; yawDeg <= maxYaw + 1e-9; yawDeg += 2) {
    const yaw = yawDeg * Math.PI / 180;
    const [FW, FK] = fft2Pair(rasterCounts(F.walls, yaw, F.cx, F.cy, lo[0], lo[1], r, n), rasterCounts(F.kerbs, yaw, F.cx, F.cy, lo[0], lo[1], r, n), n);
    const [FP] = fft2Pair(rasterCounts(F.poles, yaw, F.cx, F.cy, lo[0], lo[1], r, n), null, n);
    const acc = { re: new Float64Array(n * n), im: new Float64Array(n * n) };
    const scaled = (S: { re: Float64Array; im: Float64Array }, w: number) => ({ re: S.re.map(v => v * w), im: S.im.map(v => v * w) });
    if (DB && nW) mulConj(scaled(SB, W_WALL / nW / wSum), FW, acc);
    if (DK && nK) mulConj(scaled(SK, W_KERB / nK / wSum), FK, acc);
    if (DT && nP) mulConj(scaled(ST, W_POLE / nP / wSum), FP, acc);
    const [score] = ifft2Pair(acc, { re: new Float64Array(n * n), im: new Float64Array(n * n) }, n);
    // Local minima within the shift limit, plus the phone prior.
    const w = 2 * lim + 1, sc = new Float64Array(w * w).fill(Infinity);
    for (let si = -lim; si <= lim; si++) for (let sj = -lim; sj <= lim; sj++) {
      const k = ((si + n) % n) * n + ((sj + n) % n), shift = Math.hypot(si * r, sj * r);
      sc[(si + lim) * w + (sj + lim)] = score[k] + 0.3 * (shift / 15) ** 2 + 0.15 * (yawDeg / 25) ** 2;
    }
    for (let a = 1; a < w - 1; a++) for (let c = 1; c < w - 1; c++) {
      const k = a * w + c, s = sc[k];
      if (s <= sc[k - 1] && s <= sc[k + 1] && s <= sc[k - w] && s <= sc[k + w]) cands.push({ yaw, tx: (a - lim) * r, ty: (c - lim) * r, score: s });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const distinct: Cand[] = [];
  for (const c of cands) { if (distinct.some(d => Math.abs(d.yaw - c.yaw) < 5 * Math.PI / 180 && Math.hypot(d.tx - c.tx, d.ty - c.ty) < 3)) continue; distinct.push(c); if (distinct.length >= 6) break; }
  const phone = fitQuality(F, tB, tK, tP, 0, 0, 0);
  log(`phone position: mean distance ${phone.mean?.toFixed(2)} m, walls within 0.3 m ${phone.wall?.toFixed(2)}, trees ${phone.tree?.toFixed(2)}`);
  type Fit = Cand & { q: ReturnType<typeof fitQuality>; total: number };
  const fits: Fit[] = distinct.map(c => {
    const f = icp2d(F, tB, tK, tP, c), q = fitQuality(F, tB, tK, tP, f.yaw, f.tx, f.ty);
    const shift = Math.hypot(f.tx, f.ty), total = (q.cost ?? 9) + 0.3 * (shift / 15) ** 2 + 0.15 * (f.yaw * 180 / Math.PI / 25) ** 2;
    log(`candidate ${(c.yaw * 180 / Math.PI).toFixed(0)} deg (${c.tx.toFixed(1)}, ${c.ty.toFixed(1)}) -> ${(f.yaw * 180 / Math.PI).toFixed(1)} deg (${f.tx.toFixed(2)}, ${f.ty.toFixed(2)}): mean ${q.mean?.toFixed(2)} m, walls ${q.wall?.toFixed(2)}, trees ${q.tree?.toFixed(2)}, total ${total.toFixed(3)}`);
    return { ...f, q, total };
  }).sort((a, b) => a.total - b.total);
  if (!fits.length) return none("No candidate placement matched the map, so the scan keeps its phone position.");
  const best = fits[0];
  const runner = fits.find(f => f !== best && Math.hypot(f.tx - best.tx, f.ty - best.ty) > 2 && f.total < best.total * 1.15);
  const nPoles = F.poles.length / 2;
  const treesOk = best.q.tree !== null && nPoles >= 3 && best.q.tree >= 0.4;
  const wallsStrong = best.q.wall !== null && best.q.wall >= 0.6 && (!runner || runner.total > best.total * 1.15);
  const wallOk = treesOk || wallsStrong, kerbOk = false;
  const shift = Math.hypot(best.tx, best.ty), yawDeg = best.yaw * 180 / Math.PI;
  const transform = yawShift4(best.yaw, F.cx, F.cy, best.tx, best.ty);
  const result = (applied: boolean, note: string): Placement => ({ applied, transform: applied ? transform : identity4(), yaw_deg: Math.round(yawDeg * 10) / 10, shift_m: Math.round(shift * 100) / 100, wall_fit: best.q.wall === null ? null : Math.round(best.q.wall * 100) / 100, kerb_fit: best.q.kerb === null ? null : Math.round(best.q.kerb * 100) / 100, mean_distance_m: best.q.mean === null ? null : Math.round(best.q.mean * 100) / 100, runner_up_m: runner ? Math.round(Math.hypot(runner.tx - best.tx, runner.ty - best.ty) * 10) / 10 : null, note });
  if (!wallOk && !kerbOk) return result(false, `The scan's walls and trees do not line up with the map well enough at any nearby position, so it keeps its phone position. Best match: ${Math.round((best.q.wall ?? 0) * 100)}% of scanned walls on a mapped building face, ${best.q.tree === null ? "no" : Math.round(best.q.tree * 100) + "% of"} scanned trunks and poles at a mapped tree.`);
  if (shift > maxShift + 3 || Math.abs(yawDeg) > maxYaw + 3) return result(false, "The only map match is further from the phone position than a phone error allows, so the scan keeps its phone position.");
  const improved = phone.cost === null || best.q.cost === null || best.q.cost < phone.cost;
  if (!improved) return result(false, "The phone position already matches the map as well as any adjustment, so it was kept.");
  let note = `Placed on the map from ${ref.source}: moved ${shift.toFixed(1)} m and turned ${Math.abs(yawDeg).toFixed(1)} degrees from the phone position. ${Math.round((best.q.wall ?? 0) * 100)}% of scanned wall points sit within 0.3 m of a mapped building face${best.q.tree !== null ? `, ${Math.round(best.q.tree * 100)}% of scanned trunks and poles within 0.8 m of a mapped street tree` : ""}.`;
  if (runner) note += ` Another position ${Math.hypot(runner.tx - best.tx, runner.ty - best.ty).toFixed(0)} m away matched nearly as well. The one nearer the phone position was chosen.`;
  return result(true, note);
}

void mul4;
