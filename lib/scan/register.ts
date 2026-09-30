// Registers several phone scans of one street to each other, with no manual
// step. Ported from Tamara's Python registration (scans/swanston_registered_v2/
// registration_code) so it runs in the browser and in Node.
//
// Scaniverse georeferences each scan from the phone: position out by 10 to
// 20 m, heading by up to 25 degrees, tilt under 2 degrees, scale right.
// So for each scan after the anchor:
//   1. Coarse fit: rasterise both clouds from above (object height, kerb edges,
//      ground texture) and cross-correlate over heading and shift with FFTs.
//   2. Refine the best candidates at 10 cm.
//   3. Fine fit: point-to-plane ICP, first heading and position, then all six
//      degrees of freedom with tilt kept small.
//   4. Check each candidate: ICP residual, overlap, and whether objects in one
//      scan sit where the other saw open ground. Keep the best consistent one.
// Then a few joint rounds refine every scan against the others. A scan that
// finds no consistent fit keeps its phone GPS position and is flagged.

import { KdTree } from "./kdtree";
import { fft2Pair, ifft2Pair, mulConj, nextPow2, type Spectrum } from "./fft";

// ---------- Rigid transforms (4x4, row-major) ----------

export type Mat4 = number[];
export const identity4 = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul4(A: Mat4, B: Mat4): Mat4 {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) C[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j];
  return C;
}
export function inv4(T: Mat4): Mat4 {
  // Rigid: transpose the rotation, negate the translation.
  const R = [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]], t = [T[3], T[7], T[11]];
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const nt = [-(Rt[0] * t[0] + Rt[1] * t[1] + Rt[2] * t[2]), -(Rt[3] * t[0] + Rt[4] * t[1] + Rt[5] * t[2]), -(Rt[6] * t[0] + Rt[7] * t[1] + Rt[8] * t[2])];
  return [Rt[0], Rt[1], Rt[2], nt[0], Rt[3], Rt[4], Rt[5], nt[1], Rt[6], Rt[7], Rt[8], nt[2], 0, 0, 0, 1];
}
// Turn by `yaw` radians about (cx, cy), then move by (tx, ty, tz).
export function yawShift4(yaw: number, cx: number, cy: number, tx: number, ty: number, tz = 0): Mat4 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c, -s, 0, cx - c * cx + s * cy + tx, s, c, 0, cy - s * cx - c * cy + ty, 0, 0, 1, tz, 0, 0, 0, 1];
}
export function rotationDeg(T: Mat4) { return Math.acos(Math.max(-1, Math.min(1, (T[0] + T[5] + T[10] - 1) / 2))) * 180 / Math.PI; }
export function tiltDeg(T: Mat4) { return Math.acos(Math.max(-1, Math.min(1, T[10]))) * 180 / Math.PI; }
export function yawDeg(T: Mat4) { return Math.atan2(T[4], T[0]) * 180 / Math.PI; }
function applyTo(T: Mat4, x: Float32Array, i: number, out: number[]) {
  const px = x[i], py = x[i + 1], pz = x[i + 2];
  out[0] = T[0] * px + T[1] * py + T[2] * pz + T[3];
  out[1] = T[4] * px + T[5] * py + T[6] * pz + T[7];
  out[2] = T[8] * px + T[9] * py + T[10] * pz + T[11];
}
function transformPoints(T: Mat4, x: Float32Array, idx: Uint32Array | null): Float32Array {
  const m = idx ? idx.length : x.length / 3, out = new Float32Array(m * 3), p = [0, 0, 0];
  for (let k = 0; k < m; k++) { applyTo(T, x, (idx ? idx[k] : k) * 3, p); out[k * 3] = p[0]; out[k * 3 + 1] = p[1]; out[k * 3 + 2] = p[2]; }
  return out;
}

// ---------- Inputs and outputs ----------

export type ScanInput = { name: string; xyz: Float64Array; rgb: Uint8Array | null; count: number };

export type ScanFit = {
  name: string;
  points: number;
  status: "anchor" | "registered" | "gps-only";
  transform: Mat4;            // raw map coordinates to registered map coordinates
  centre_raw: [number, number]; // the scan's phone position (centroid, map coordinates)
  moved_m: number;            // distance the scan moved from its phone position
  turned_deg: number;         // heading change from the phone heading
  rms_m: number | null;       // point-to-plane residual against the other scans
  overlap: number | null;     // share of this scan's points with a neighbour in the others
  consistency: number | null; // objects agreeing with open ground in the others (1 = perfect)
  note: string;
};

export type Registration = {
  origin: [number, number, number]; // local frame origin in map coordinates
  fits: ScanFit[];
  local: Mat4[];                    // transforms in the local frame, same order as `fits`
  notes: string[];
  seconds: number;
};

export type Progress = (message: string) => void;

// ---------- Per-scan preparation ----------

export type Prep = {
  name: string; count: number; n: number;
  x: Float32Array; h: Float32Array; b: Float32Array | null; // cleaned points (local frame), height above own ground, brightness
  plane: [number, number, number];
  cx: number; cy: number;
  featIdx: Uint32Array; srcIdx: Uint32Array; tgtIdx: Uint32Array;
  tgtNrm: Float32Array;
  bbox: [number, number, number, number];
};

const VOX = 131072, VOX_OFF = 65536;
function voxelKey(x: number, y: number, z: number, v: number) {
  return ((Math.floor(x / v) + VOX_OFF) * VOX + (Math.floor(y / v) + VOX_OFF)) * VOX + (Math.floor(z / v) + VOX_OFF);
}
function voxelSubsample(x: Float32Array, n: number, v: number, cap = Infinity): Uint32Array {
  const seen = new Set<number>(), out: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = voxelKey(x[i * 3], x[i * 3 + 1], x[i * 3 + 2], v);
    if (!seen.has(k)) { seen.add(k); out.push(i); }
  }
  if (out.length > cap) { // deterministic thinning
    const step = out.length / cap, thin: number[] = [];
    for (let t = 0; t < cap; t++) thin.push(out[Math.floor(t * step)]);
    return Uint32Array.from(thin);
  }
  return Uint32Array.from(out);
}

function median(a: Float32Array | number[]) { const s = Float32Array.from(a).sort(); return s.length ? s[s.length >> 1] : NaN; }
function quantile(a: Float32Array, q: number) { const s = Float32Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN; }

// Solves the small symmetric system A x = b (Gauss-Jordan with pivoting).
function solve(A: number[][], b: number[]): number[] {
  const m = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= m; j++) M[c][j] /= d;
    for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= m; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(row => row[m]);
}

// Robust plane z = a x + b y + c through the lowest point of each 1 m cell.
function groundPlane(x: Float32Array, n: number): [number, number, number] {
  const low = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = (Math.floor(x[i * 3]) + VOX_OFF) * VOX + (Math.floor(x[i * 3 + 1]) + VOX_OFF);
    const cur = low.get(k);
    if (cur === undefined || x[i * 3 + 2] < x[cur * 3 + 2]) low.set(k, i);
  }
  let g = [...low.values()];
  let p: number[] = [0, 0, 0];
  for (let it = 0; it < 4; it++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bb = [0, 0, 0];
    for (const i of g) {
      const r = [x[i * 3], x[i * 3 + 1], 1], z = x[i * 3 + 2];
      for (let a = 0; a < 3; a++) { bb[a] += r[a] * z; for (let c = 0; c < 3; c++) A[a][c] += r[a] * r[c]; }
    }
    if (g.length < 3) break;
    p = solve(A, bb);
    const res = g.map(i => Math.abs(x[i * 3 + 2] - (p[0] * x[i * 3] + p[1] * x[i * 3 + 1] + p[2])));
    const lim = Math.max(0.15, 2.5 * median(res));
    const keep = g.filter((_, k) => res[k] < lim);
    if (keep.length < 3) break;
    g = keep;
  }
  return [p[0], p[1], p[2]];
}

// Smallest eigenvector of a symmetric 3x3 matrix (Jacobi rotations).
function smallestEigenvector(m: number[]): [number, number, number] {
  const a = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  let best = 0;
  for (let k = 1; k < 3; k++) if (a[k][k] < a[best][best]) best = k;
  return [v[0][best], v[1][best], v[2][best]];
}

function normals(pts: Float32Array, m: number): Float32Array {
  const tree = new KdTree(pts, m), out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const nb = tree.knn(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], 10, 0.3);
    if (nb.length < 5) { out[i * 3 + 2] = 1; continue; }
    let mx = 0, my = 0, mz = 0;
    for (const j of nb) { mx += pts[j * 3]; my += pts[j * 3 + 1]; mz += pts[j * 3 + 2]; }
    mx /= nb.length; my /= nb.length; mz /= nb.length;
    const c = [0, 0, 0, 0, 0, 0];
    for (const j of nb) {
      const dx = pts[j * 3] - mx, dy = pts[j * 3 + 1] - my, dz = pts[j * 3 + 2] - mz;
      c[0] += dx * dx; c[1] += dx * dy; c[2] += dx * dz; c[3] += dy * dy; c[4] += dy * dz; c[5] += dz * dz;
    }
    const [nx, ny, nz] = smallestEigenvector(c);
    const s = nz < 0 ? -1 : 1; // normals point up so ground planes agree
    out[i * 3] = nx * s; out[i * 3 + 1] = ny * s; out[i * 3 + 2] = nz * s;
  }
  return out;
}

export function prepareScan(scan: ScanInput, origin: [number, number, number]): Prep {
  const { xyz, rgb, count } = scan;
  const step = Math.max(1, Math.floor(count / 50000)), zs: number[] = [];
  for (let i = 0; i < count; i += step) zs.push(xyz[i * 3 + 2]);
  const zmed = median(zs);
  let n = 0;
  for (let i = 0; i < count; i++) { const z = xyz[i * 3 + 2]; if (z > zmed - 2.5 && z < zmed + 8) n++; }
  const x = new Float32Array(n * 3), b = rgb ? new Float32Array(n) : null;
  let k = 0;
  for (let i = 0; i < count; i++) {
    const z = xyz[i * 3 + 2];
    if (!(z > zmed - 2.5 && z < zmed + 8)) continue;
    x[k * 3] = xyz[i * 3] - origin[0]; x[k * 3 + 1] = xyz[i * 3 + 1] - origin[1]; x[k * 3 + 2] = z - origin[2];
    if (b && rgb) b[k] = (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 765;
    k++;
  }
  const plane = groundPlane(x, n);
  const h = new Float32Array(n);
  let cx = 0, cy = 0;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const px = x[i * 3], py = x[i * 3 + 1];
    h[i] = x[i * 3 + 2] - (plane[0] * px + plane[1] * py + plane[2]);
    cx += px; cy += py;
    if (px < bbox[0]) bbox[0] = px; if (py < bbox[1]) bbox[1] = py; if (px > bbox[2]) bbox[2] = px; if (py > bbox[3]) bbox[3] = py;
  }
  cx /= n; cy /= n;
  const featIdx = voxelSubsample(x, n, 0.1, 250000);
  const srcIdx = voxelSubsample(x, n, 0.08, 20000);
  const tgtIdx = voxelSubsample(x, n, 0.06);
  const tgtNrm = normals(transformPoints(identity4(), x, tgtIdx), tgtIdx.length);
  return { name: scan.name, count, n, x, h, b, plane, cx, cy, featIdx, srcIdx, tgtIdx, tgtNrm, bbox };
}

// ---------- Feature rasters and the FFT search ----------

type FeatPts = { x: Float32Array; h: Float32Array; b: Float32Array | null; idx: Uint32Array };
type Rot = { cos: number; sin: number; cx: number; cy: number; tx: number; ty: number };
type Channels = { occ: Float64Array; obj: Float64Array; edge: Float64Array; tex: Float64Array; energy: Float64Array };
const W_OBJ = 1.0, W_EDGE = 1.0, W_TEX = 0.4;

function sobelMagnitude(f: Float32Array | Float64Array, n: number, out: Float64Array) {
  for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) {
    const k = i * n + j;
    const gx = (f[k + n - 1] + 2 * f[k + n] + f[k + n + 1]) - (f[k - n - 1] + 2 * f[k - n] + f[k - n + 1]);
    const gy = (f[k - n + 1] + 2 * f[k + 1] + f[k + n + 1]) - (f[k - n - 1] + 2 * f[k - 1] + f[k + n - 1]);
    out[k] = Math.hypot(gx, gy);
  }
}
// Cells whose 5x5 neighbourhood is fully occupied.
function erode2(occ: Uint8Array, n: number): Uint8Array {
  const tmp = new Uint8Array(n * n), out = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 2; j < n - 2; j++) { const k = i * n + j; tmp[k] = occ[k - 2] & occ[k - 1] & occ[k] & occ[k + 1] & occ[k + 2]; }
  for (let i = 2; i < n - 2; i++) for (let j = 0; j < n; j++) { const k = i * n + j; out[k] = tmp[k - 2 * n] & tmp[k - n] & tmp[k] & tmp[k + n] & tmp[k + 2 * n]; }
  return out;
}

function rasterise(P: FeatPts, rot: Rot | null, ox: number, oy: number, res: number, n: number): Channels {
  const N = n * n, cnt = new Int32Array(N), minH = new Float32Array(N).fill(Infinity), maxH = new Float32Array(N).fill(-Infinity);
  const sumB = new Float32Array(N), cntG = new Int32Array(N);
  const { x, h, b, idx } = P;
  for (let k = 0; k < idx.length; k++) {
    const i3 = idx[k] * 3;
    let px = x[i3], py = x[i3 + 1];
    if (rot) { const dx = px - rot.cx, dy = py - rot.cy; px = rot.cos * dx - rot.sin * dy + rot.cx + rot.tx; py = rot.sin * dx + rot.cos * dy + rot.cy + rot.ty; }
    const i = Math.floor((px - ox) / res), j = Math.floor((py - oy) / res);
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const c = i * n + j, hh = h[idx[k]];
    cnt[c]++;
    if (hh < minH[c]) minH[c] = hh;
    if (hh > maxH[c]) maxH[c] = hh;
    if (b && hh > -0.25 && hh < 0.25) { sumB[c] += b[idx[k]]; cntG[c]++; }
  }
  const occ = new Float64Array(N), obj = new Float64Array(N), edge = new Float64Array(N), tex = new Float64Array(N), energy = new Float64Array(N);
  const occ8 = new Uint8Array(N), ground8 = new Uint8Array(N), minH0 = new Float32Array(N), mb = new Float32Array(N);
  let bsum = 0, bcnt = 0;
  for (let c = 0; c < N; c++) {
    if (cnt[c] > 0) { occ[c] = 1; occ8[c] = 1; obj[c] = Math.min(2.5, Math.max(0, maxH[c] - minH[c])) / 2.5; minH0[c] = minH[c]; }
    if (cntG[c] > 0) { ground8[c] = 1; mb[c] = sumB[c] / cntG[c]; bsum += mb[c]; bcnt++; }
  }
  const bmean = bcnt ? bsum / bcnt : 0;
  for (let c = 0; c < N; c++) if (!ground8[c]) mb[c] = bmean;
  const e1 = erode2(occ8, n), e2 = erode2(ground8, n);
  const gm = new Float64Array(N), gt = new Float64Array(N);
  sobelMagnitude(minH0, n, gm);
  if (b) sobelMagnitude(mb, n, gt);
  for (let c = 0; c < N; c++) {
    edge[c] = e1[c] ? Math.min(0.6, gm[c]) / 0.6 : 0;
    tex[c] = b && e2[c] ? Math.min(1, gt[c]) : 0;
    obj[c] *= W_OBJ; edge[c] *= W_EDGE; tex[c] *= W_TEX;
    energy[c] = obj[c] * obj[c] + edge[c] * edge[c] + tex[c] * tex[c];
  }
  return { occ, obj, edge, tex, energy };
}

type FixedSpectra = { F: Spectrum[]; O: Spectrum; E: Spectrum; cells: number };
function spectra(ch: Channels, n: number): FixedSpectra {
  const [f1, f2] = fft2Pair(ch.obj, ch.edge, n), [f3, O] = fft2Pair(ch.tex, ch.occ, n), [E] = fft2Pair(ch.energy, null, n);
  let cells = 0; for (let k = 0; k < ch.occ.length; k++) cells += ch.occ[k];
  return { F: [f1, f2, f3], O, E, cells };
}

export type Candidate = { yaw: number; tx: number; ty: number; score: number; overlap_m2: number };

// Best shifts of the moving raster against the fixed spectra. Returns up to `top` distinct peaks.
function correlate(A: FixedSpectra, B: FixedSpectra, n: number, res: number, lim: number, minOvCells: number, top: number, sep: number, normCells: number): { si: number; sj: number; score: number; ov: number }[] {
  let NUM = mulConj(A.F[0], B.F[0]); NUM = mulConj(A.F[1], B.F[1], NUM); NUM = mulConj(A.F[2], B.F[2], NUM);
  const OV = mulConj(A.O, B.O), ENA = mulConj(A.E, B.O), ENB = mulConj(A.O, B.E);
  const [num, ov] = ifft2Pair(NUM, OV, n), [ena, enb] = ifft2Pair(ENA, ENB, n);
  const w = 2 * lim + 1, sc = new Float64Array(w * w);
  for (let si = -lim; si <= lim; si++) for (let sj = -lim; sj <= lim; sj++) {
    const k = ((si + n) % n) * n + ((sj + n) % n);
    if (ov[k] < minOvCells) continue;
    sc[(si + lim) * w + (sj + lim)] = num[k] / Math.sqrt(Math.max(ena[k], 1e-6) * Math.max(enb[k], 1e-6)) * Math.pow(Math.min(1, ov[k] / normCells), 0.25);
  }
  // Local maxima, best first, at least `sep` cells apart.
  const peaks: { si: number; sj: number; score: number }[] = [];
  for (let a = 1; a < w - 1; a++) for (let c = 1; c < w - 1; c++) {
    const k = a * w + c, s = sc[k];
    if (s <= 0.02) continue;
    if (s >= sc[k - 1] && s >= sc[k + 1] && s >= sc[k - w] && s >= sc[k + w] && s >= sc[k - w - 1] && s >= sc[k - w + 1] && s >= sc[k + w - 1] && s >= sc[k + w + 1]) peaks.push({ si: a - lim, sj: c - lim, score: s });
  }
  peaks.sort((p, q) => q.score - p.score);
  const out: { si: number; sj: number; score: number; ov: number }[] = [];
  for (const p of peaks) {
    if (out.some(o => Math.abs(o.si - p.si) < sep && Math.abs(o.sj - p.sj) < sep)) continue;
    out.push({ ...p, ov: ov[((p.si + n) % n) * n + ((p.sj + n) % n)] * res * res });
    if (out.length >= top) break;
  }
  return out;
}

function bboxOf(P: FeatPts, rot: Rot | null): [number, number, number, number] {
  const bb: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.idx.length; k++) {
    let px = P.x[P.idx[k] * 3], py = P.x[P.idx[k] * 3 + 1];
    if (rot) { const dx = px - rot.cx, dy = py - rot.cy; px = rot.cos * dx - rot.sin * dy + rot.cx + rot.tx; py = rot.sin * dx + rot.cos * dy + rot.cy + rot.ty; }
    if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (px > bb[2]) bb[2] = px; if (py > bb[3]) bb[3] = py;
  }
  return bb;
}
function cropFeat(P: FeatPts, bb: [number, number, number, number]): FeatPts {
  const keep: number[] = [];
  for (let k = 0; k < P.idx.length; k++) { const px = P.x[P.idx[k] * 3], py = P.x[P.idx[k] * 3 + 1]; if (px >= bb[0] && px <= bb[2] && py >= bb[1] && py <= bb[3]) keep.push(P.idx[k]); }
  return { ...P, idx: Uint32Array.from(keep) };
}
const rotOf = (yawDeg: number, cx: number, cy: number, tx = 0, ty = 0): Rot => ({ cos: Math.cos(yawDeg * Math.PI / 180), sin: Math.sin(yawDeg * Math.PI / 180), cx, cy, tx, ty });

// Coarse search: heading in `yaws` (degrees) about B's centroid, shift within maxShift.
export function coarseSearch(A: FeatPts, B: FeatPts, cB: [number, number], yaws: number[], maxShift: number, gridN: number, top = 6): Candidate[] {
  const ba = bboxOf(A, null), bb = bboxOf(B, null);
  const lo = [Math.min(ba[0], bb[0]) - maxShift - 1, Math.min(ba[1], bb[1]) - maxShift - 1], hi = [Math.max(ba[2], bb[2]) + maxShift + 1, Math.max(ba[3], bb[3]) + maxShift + 1];
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const res = span / gridN, n = gridN, lim = Math.floor(maxShift / res);
  const SA = spectra(rasterise(A, null, lo[0], lo[1], res, n), n);
  const all: Candidate[] = [];
  for (const yaw of yaws) {
    const SB = spectra(rasterise(B, rotOf(yaw, cB[0], cB[1]), lo[0], lo[1], res, n), n);
    const minOv = Math.max(8 / (res * res), 0.12 * SB.cells);
    for (const p of correlate(SA, SB, n, res, lim, minOv, 4, Math.ceil(2 / res), SB.cells)) all.push({ yaw, tx: p.si * res, ty: p.sj * res, score: p.score, overlap_m2: p.ov });
  }
  all.sort((p, q) => q.score - p.score);
  const out: Candidate[] = [];
  for (const c of all) {
    if (out.some(o => Math.abs(o.yaw - c.yaw) <= 5 && Math.hypot(o.tx - c.tx, o.ty - c.ty) <= 2.5)) continue;
    out.push(c);
    if (out.length >= top) break;
  }
  return out;
}

// Refines one candidate at 10 cm over a small heading and shift window, on the overlap only.
export function refineCandidate(A: FeatPts, B: FeatPts, cB: [number, number], cand: Candidate, maxShift = 2.5, yawWindow = 3): Candidate | null {
  const r0 = rotOf(cand.yaw, cB[0], cB[1], cand.tx, cand.ty);
  const ba = bboxOf(A, null), bb = bboxOf(B, r0);
  const ov: [number, number, number, number] = [Math.max(ba[0], bb[0]) - 3, Math.max(ba[1], bb[1]) - 3, Math.min(ba[2], bb[2]) + 3, Math.min(ba[3], bb[3]) + 3];
  if (ov[2] - ov[0] < 4 || ov[3] - ov[1] < 4) return null;
  const Ac = cropFeat(A, ov);
  // B's points moved by the candidate, then cropped.
  const moved = transformPoints(yawShift4(cand.yaw * Math.PI / 180, cB[0], cB[1], cand.tx, cand.ty), B.x, B.idx);
  const Bm: FeatPts = { x: moved, h: Float32Array.from(B.idx, i => B.h[i]), b: B.b ? Float32Array.from(B.idx, i => B.b![i]) : null, idx: Uint32Array.from({ length: B.idx.length }, (_, k) => k) };
  const Bc = cropFeat(Bm, ov);
  if (Ac.idx.length < 200 || Bc.idx.length < 200) return null;
  let res = 0.1;
  const span = Math.max(ov[2] - ov[0], ov[3] - ov[1]) + 2 * maxShift + 2;
  let n = nextPow2(span / res);
  if (n > 256) { n = 256; res = span / n; }
  const lo = [ov[0] - maxShift - 1, ov[1] - maxShift - 1], lim = Math.round(maxShift / res);
  const minOv = 8 / (res * res);
  const SA = spectra(rasterise(Ac, null, lo[0], lo[1], res, n), n);
  const c2: [number, number] = [cB[0] + cand.tx, cB[1] + cand.ty];
  let best: (Candidate & { fine: number }) | null = null;
  for (let d = -yawWindow; d <= yawWindow + 1e-9; d += 1.5) {
    const SB = spectra(rasterise(Bc, rotOf(d, c2[0], c2[1]), lo[0], lo[1], res, n), n);
    const p = correlate(SA, SB, n, res, lim, minOv, 1, 1, SB.cells)[0];
    if (p && (!best || p.score > best.fine)) best = { yaw: cand.yaw + d, tx: cand.tx + p.si * res, ty: cand.ty + p.sj * res, score: cand.score, overlap_m2: p.ov, fine: p.score };
  }
  return best;
}

// ---------- ICP ----------

export type Target = { pts: Float32Array; nrm: Float32Array; h: Float32Array; b: Float32Array | null; m: number; tree: KdTree };

export function buildTarget(preps: Prep[], transforms: Mat4[], within: [number, number, number, number] | null): Target {
  const px: number[] = [], pn: number[] = [], ph: number[] = [], pb: number[] = [], p = [0, 0, 0];
  const colour = preps.every(P => P.b);
  preps.forEach((P, s) => {
    const T = transforms[s];
    for (let k = 0; k < P.tgtIdx.length; k++) {
      applyTo(T, P.x, P.tgtIdx[k] * 3, p);
      if (within && (p[0] < within[0] || p[0] > within[2] || p[1] < within[1] || p[1] > within[3])) continue;
      px.push(p[0], p[1], p[2]);
      const nx = P.tgtNrm[k * 3], ny = P.tgtNrm[k * 3 + 1], nz = P.tgtNrm[k * 3 + 2];
      pn.push(T[0] * nx + T[1] * ny + T[2] * nz, T[4] * nx + T[5] * ny + T[6] * nz, T[8] * nx + T[9] * ny + T[10] * nz);
      ph.push(P.h[P.tgtIdx[k]]);
      if (colour) pb.push(P.b![P.tgtIdx[k]]);
    }
  });
  const pts = Float32Array.from(px);
  return { pts, nrm: Float32Array.from(pn), h: Float32Array.from(ph), b: colour ? Float32Array.from(pb) : null, m: px.length / 3, tree: new KdTree(pts, px.length / 3) };
}

function rodrigues(a: number, b: number, g: number): number[] {
  const th = Math.hypot(a, b, g);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const kx = a / th, ky = b / th, kz = g / th, c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  return [c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s, ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s, kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v];
}

// Point-to-plane ICP. dof 4 = heading and position; dof 6 = full rigid.
export function icp(src: Float32Array, k: number, tgt: Target, T0: Mat4, dof: 4 | 6, iters: number, dmax: [number, number], trim: number): Mat4 {
  let T = [...T0];
  const p = [0, 0, 0], d2 = new Float64Array(1);
  const yy = new Float64Array(k * 3), nn = new Float64Array(k * 3), rr = new Float64Array(k);
  let cx0 = 0, cy0 = 0, cz0 = 0;
  for (let i = 0; i < k; i++) { cx0 += src[i * 3]; cy0 += src[i * 3 + 1]; cz0 += src[i * 3 + 2]; }
  cx0 /= k; cy0 /= k; cz0 /= k;
  for (let it = 0; it < iters; it++) {
    const dLim = dmax[0] + (dmax[1] - dmax[0]) * Math.min(1, it / (iters * 0.6));
    let m = 0;
    for (let i = 0; i < k; i++) {
      applyTo(T, src, i * 3, p);
      const j = tgt.tree.nearest(p[0], p[1], p[2], dLim, d2);
      if (j < 0) continue;
      const nx = tgt.nrm[j * 3], ny = tgt.nrm[j * 3 + 1], nz = tgt.nrm[j * 3 + 2];
      yy[m * 3] = p[0]; yy[m * 3 + 1] = p[1]; yy[m * 3 + 2] = p[2];
      nn[m * 3] = nx; nn[m * 3 + 1] = ny; nn[m * 3 + 2] = nz;
      rr[m] = (p[0] - tgt.pts[j * 3]) * nx + (p[1] - tgt.pts[j * 3 + 1]) * ny + (p[2] - tgt.pts[j * 3 + 2]) * nz;
      m++;
    }
    if (m < 100) break;
    const abs = new Float32Array(m); for (let i = 0; i < m; i++) abs[i] = Math.abs(rr[i]);
    const lim = quantile(abs, trim);
    // Centre for the rotation: the kept points' centroid (dof 6) or the source centroid (dof 4).
    let cc = [0, 0, 0], kept = 0;
    if (dof === 6) { for (let i = 0; i < m; i++) if (abs[i] <= lim) { cc[0] += yy[i * 3]; cc[1] += yy[i * 3 + 1]; cc[2] += yy[i * 3 + 2]; kept++; } cc = cc.map(v => v / kept); }
    else { const c0 = new Float32Array([cx0, cy0, cz0]); applyTo(T, c0, 0, p); cc = [p[0], p[1], p[2]]; }
    const A = Array.from({ length: dof }, () => new Array(dof).fill(0)), bvec = new Array(dof).fill(0), J = new Array(dof).fill(0);
    for (let i = 0; i < m; i++) {
      if (abs[i] > lim) continue;
      const px = yy[i * 3] - cc[0], py = yy[i * 3 + 1] - cc[1], pz = yy[i * 3 + 2] - cc[2], nx = nn[i * 3], ny = nn[i * 3 + 1], nz = nn[i * 3 + 2];
      if (dof === 6) { J[0] = py * nz - pz * ny; J[1] = pz * nx - px * nz; J[2] = px * ny - py * nx; J[3] = nx; J[4] = ny; J[5] = nz; }
      else { J[0] = nx * -py + ny * px; J[1] = nx; J[2] = ny; J[3] = nz; }
      for (let a = 0; a < dof; a++) { bvec[a] -= J[a] * rr[i]; for (let c = 0; c < dof; c++) A[a][c] += J[a] * J[c]; }
    }
    const dx = solve(A, bvec);
    const R = dof === 6 ? rodrigues(dx[0], dx[1], dx[2]) : rodrigues(0, 0, dx[0]);
    const t = dof === 6 ? [dx[3], dx[4], dx[5]] : [dx[1], dx[2], dx[3]];
    const dT: Mat4 = [R[0], R[1], R[2], cc[0] - (R[0] * cc[0] + R[1] * cc[1] + R[2] * cc[2]) + t[0],
      R[3], R[4], R[5], cc[1] - (R[3] * cc[0] + R[4] * cc[1] + R[5] * cc[2]) + t[1],
      R[6], R[7], R[8], cc[2] - (R[6] * cc[0] + R[7] * cc[1] + R[8] * cc[2]) + t[2], 0, 0, 0, 1];
    T = mul4(dT, T);
    if (Math.max(...dx.map(Math.abs)) < 2e-5) break;
  }
  return T;
}

export function icpMetrics(src: Float32Array, k: number, tgt: Target, T: Mat4): { rms: number; overlap: number; near: number } {
  const p = [0, 0, 0], d2 = new Float64Array(1);
  let n = 0, sum = 0, near = 0;
  for (let i = 0; i < k; i++) {
    applyTo(T, src, i * 3, p);
    const j = tgt.tree.nearest(p[0], p[1], p[2], 0.2, d2);
    if (j < 0) continue;
    near++;
    if (d2[0] > 0.15 * 0.15) continue;
    const r = (p[0] - tgt.pts[j * 3]) * tgt.nrm[j * 3] + (p[1] - tgt.pts[j * 3 + 1]) * tgt.nrm[j * 3 + 1] + (p[2] - tgt.pts[j * 3 + 2]) * tgt.nrm[j * 3 + 2];
    sum += r * r; n++;
  }
  return { rms: n ? Math.sqrt(sum / n) : Infinity, overlap: k ? near / k : 0, near };
}

// Median height offset of the moving scan's ground against the target's ground, on a 0.5 m grid.
function groundOffset(src: Float32Array, srcH: Float32Array, k: number, tgt: Target, T: Mat4): number {
  const cell = 0.5, ground = new Map<number, number>();
  for (let j = 0; j < tgt.m; j++) {
    if (Math.abs(tgt.h[j]) > 0.1) continue;
    const key = (Math.floor(tgt.pts[j * 3] / cell) + VOX_OFF) * VOX + (Math.floor(tgt.pts[j * 3 + 1] / cell) + VOX_OFF);
    const z = tgt.pts[j * 3 + 2], cur = ground.get(key);
    if (cur === undefined || z < cur) ground.set(key, z);
  }
  const diffs: number[] = [], p = [0, 0, 0];
  for (let i = 0; i < k; i++) {
    if (Math.abs(srcH[i]) > 0.1) continue;
    applyTo(T, src, i * 3, p);
    const z = ground.get((Math.floor(p[0] / cell) + VOX_OFF) * VOX + (Math.floor(p[1] / cell) + VOX_OFF));
    if (z !== undefined) diffs.push(z - p[2]);
  }
  return diffs.length >= 30 ? median(diffs) : 0;
}

// Objects in one scan against open ground in the other, on a 10 cm grid.
// `consistency` = agreeing object cells / (agreeing + conflicting); `conflictRate` = conflicting share of the moving scan's object cells inside the other scans' footprint.
export type Consistency = { consistency: number; conflictRate: number; agree: number; conflict: number; objects: number | null; objectAgree: number; objectConflict: number };
export function consistency(src: Float32Array, srcH: Float32Array, k: number, tgt: Target, T: Mat4, grow = 1): Consistency | null {
  const res = 0.1, p = [0, 0, 0];
  const moved = new Float32Array(k * 3);
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < k; i++) { applyTo(T, src, i * 3, p); moved[i * 3] = p[0]; moved[i * 3 + 1] = p[1]; moved[i * 3 + 2] = p[2]; if (p[0] < bb[0]) bb[0] = p[0]; if (p[1] < bb[1]) bb[1] = p[1]; if (p[0] > bb[2]) bb[2] = p[0]; if (p[1] > bb[3]) bb[3] = p[1]; }
  const nx = Math.ceil((bb[2] - bb[0]) / res) + 3, ny = Math.ceil((bb[3] - bb[1]) / res) + 3, N = nx * ny;
  if (N > 4e6) return null;
  const G = new Uint8Array(N), O = new Uint8Array(N), Gm = new Uint8Array(N), Om = new Uint8Array(N), any = new Uint8Array(N);
  const cellOf = (x: number, y: number) => { const i = Math.floor((x - bb[0]) / res) + 1, j = Math.floor((y - bb[1]) / res) + 1; return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : i * ny + j; };
  for (let j = 0; j < tgt.m; j++) { const c = cellOf(tgt.pts[j * 3], tgt.pts[j * 3 + 1]); if (c < 0) continue; any[c] = 1; const hh = tgt.h[j]; if (Math.abs(hh) < 0.08) G[c] = 1; else if (hh > 0.3 && hh < 2.0) O[c] = 1; }
  for (let i = 0; i < k; i++) { const c = cellOf(moved[i * 3], moved[i * 3 + 1]); if (c < 0) continue; const hh = srcH[i]; if (Math.abs(hh) < 0.08) Gm[c] = 1; else if (hh > 0.3 && hh < 2.0) Om[c] = 1; }
  const dilate1 = (a: Uint8Array) => { const d = new Uint8Array(N); for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) { const c = i * ny + j; if (a[c]) { d[c - ny - 1] = d[c - ny] = d[c - ny + 1] = d[c - 1] = d[c] = d[c + 1] = d[c + ny - 1] = d[c + ny] = d[c + ny + 1] = 1; } } return d; };
  const dilate = (a: Uint8Array) => { let d = a; for (let g = 0; g < grow; g++) d = dilate1(d); return d; };
  // Confirmed ground: the cell and its four neighbours are ground.
  const interior = (a: Uint8Array) => { const d = new Uint8Array(N); for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) { const c = i * ny + j; d[c] = a[c] & a[c - 1] & a[c + 1] & a[c - ny] & a[c + ny]; } return d; };
  const Od = dilate(O), Omd = dilate(Om), Gi = interior(G), Gmi = interior(Gm), anyD = dilate(any);
  let agree = 0, conflict = 0, inside = 0;
  for (let c = 0; c < N; c++) {
    if (Om[c] && anyD[c]) inside++;
    if (Om[c] && Od[c]) agree++;
    if (O[c] && Omd[c]) agree++;
    if (Om[c] && Gi[c] && !Od[c]) conflict++;
    if (O[c] && Gmi[c] && !Omd[c]) conflict++;
  }
  // The same, for compact objects only (trunks, poles, bins, signs): walls line up at any shift along themselves, these do not.
  const compact = (a: Uint8Array) => {
    const out = new Uint8Array(N), seen = new Uint8Array(N);
    for (let start = 0; start < N; start++) {
      if (!a[start] || seen[start]) continue;
      const stack = [start], cells: number[] = [];
      seen[start] = 1;
      while (stack.length) {
        const c = stack.pop()!; cells.push(c);
        const i = Math.floor(c / ny), j = c % ny;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const cc = ii * ny + jj; if (a[cc] && !seen[cc]) { seen[cc] = 1; stack.push(cc); } }
      }
      if (cells.length <= 40) for (const c of cells) out[c] = 1;
    }
    return out;
  };
  const Oc = compact(O), Omc = compact(Om);
  // Each compact object (connected cells) agrees if most of it sits on or next to an object of the other
  // scan, and conflicts if most of it sits on the other scan's confirmed open ground.
  const judge = (mine: Uint8Array, theirsDilated: Uint8Array, theirGround: Uint8Array): [number, number] => {
    const seen = new Uint8Array(N);
    let agree = 0, conflict = 0;
    for (let start = 0; start < N; start++) {
      if (!mine[start] || seen[start]) continue;
      const stack = [start]; seen[start] = 1;
      let cells = 0, on = 0, ground = 0;
      while (stack.length) {
        const c = stack.pop()!; cells++;
        if (theirsDilated[c]) on++; else if (theirGround[c]) ground++;
        const i = Math.floor(c / ny), j = c % ny;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const cc = ii * ny + jj; if (mine[cc] && !seen[cc]) { seen[cc] = 1; stack.push(cc); } }
      }
      if (on >= 0.5 * cells) agree++; else if (ground >= 0.5 * cells) conflict++;
    }
    return [agree, conflict];
  };
  const [a1, c1] = judge(Omc, Od, Gi), [a2, c2] = judge(Oc, Omd, Gmi);
  const cAgree = a1 + a2, cConflict = c1 + c2, cInside = 0;
  void cInside;
  return agree + conflict >= 20 ? { consistency: agree / (agree + conflict), conflictRate: inside ? Math.min(1, conflict / inside) : 0, agree, conflict, objects: cAgree + cConflict >= 3 ? cAgree / (cAgree + cConflict) : null, objectAgree: cAgree, objectConflict: cConflict } : null;
}

// Walls against walls: of the moving scan's wall points that have a wall of the other scans within 0.5 m,
// the share within 5 cm of that wall (point-to-plane). Ground fits any heading; walls do not.
export function wallFit(src: Float32Array, srcH: Float32Array, k: number, tgt: Target, T: Mat4, tolerance = 0.05): { fit: number; points: number; close: number } | null {
  const p = [0, 0, 0], d2 = new Float64Array(1);
  let inOverlap = 0, close = 0;
  for (let i = 0; i < k; i++) {
    if (srcH[i] < 0.3 || srcH[i] > 3.0) continue;
    applyTo(T, src, i * 3, p);
    // Nearest wall point of the others: take up to 8 neighbours within 0.5 m and keep the wall ones.
    const nb = tgt.tree.knn(p[0], p[1], p[2], 8, 0.5);
    let best = Infinity;
    for (const j of nb) {
      if (tgt.h[j] < 0.3 || tgt.h[j] > 3.0) continue;
      const r = Math.abs((p[0] - tgt.pts[j * 3]) * tgt.nrm[j * 3] + (p[1] - tgt.pts[j * 3 + 1]) * tgt.nrm[j * 3 + 1] + (p[2] - tgt.pts[j * 3 + 2]) * tgt.nrm[j * 3 + 2]);
      if (r < best) best = r;
    }
    if (best === Infinity) continue;
    inOverlap++;
    if (best < tolerance) close++;
  }
  void d2;
  return inOverlap >= 100 ? { fit: close / inOverlap, points: inOverlap, close } : null;
}

// Correlation of ground brightness between the moving scan and the others where they overlap (10 cm cells).
export function textureNcc(src: Float32Array, srcH: Float32Array, srcB: Float32Array | null, k: number, tgt: Target, T: Mat4): { ncc: number; cells: number } | null {
  if (!srcB || !tgt.b) return null;
  const res = 0.1, p = [0, 0, 0];
  const bb = [Infinity, Infinity, -Infinity, -Infinity], moved = new Float32Array(k * 2);
  for (let i = 0; i < k; i++) { applyTo(T, src, i * 3, p); moved[i * 2] = p[0]; moved[i * 2 + 1] = p[1]; if (p[0] < bb[0]) bb[0] = p[0]; if (p[1] < bb[1]) bb[1] = p[1]; if (p[0] > bb[2]) bb[2] = p[0]; if (p[1] > bb[3]) bb[3] = p[1]; }
  const nx = Math.ceil((bb[2] - bb[0]) / res) + 2, ny = Math.ceil((bb[3] - bb[1]) / res) + 2, N = nx * ny;
  if (N > 4e6) return null;
  const sa = new Float32Array(N), na = new Uint16Array(N), sb = new Float32Array(N), nb = new Uint16Array(N);
  const cellOf = (x: number, y: number) => { const i = Math.floor((x - bb[0]) / res), j = Math.floor((y - bb[1]) / res); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : i * ny + j; };
  for (let j = 0; j < tgt.m; j++) { if (Math.abs(tgt.h[j]) > 0.1) continue; const c = cellOf(tgt.pts[j * 3], tgt.pts[j * 3 + 1]); if (c >= 0) { sa[c] += tgt.b[j]; na[c]++; } }
  for (let i = 0; i < k; i++) { if (Math.abs(srcH[i]) > 0.1) continue; const c = cellOf(moved[i * 2], moved[i * 2 + 1]); if (c >= 0) { sb[c] += srcB[i]; nb[c]++; } }
  const a: number[] = [], b: number[] = [];
  for (let c = 0; c < N; c++) if (na[c] && nb[c]) { a.push(sa[c] / na[c]); b.push(sb[c] / nb[c]); }
  if (a.length < 300) return null;
  const norm = (v: number[]) => { const m = v.reduce((x, y) => x + y, 0) / v.length, sd = Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length) || 1e-6; return v.map(x => (x - m) / sd); };
  const za = norm(a), zb = norm(b);
  let sum = 0; for (let i = 0; i < za.length; i++) sum += za[i] * zb[i];
  return { ncc: sum / za.length, cells: za.length };
}

// ---------- Orchestration ----------

// `mapScore` scores a set of placements against reference map data (lower is better, null if it cannot),
// used to decide between hypotheses the scans alone cannot separate.
// `mapPlace` places a set of scans on the map on its own (transform in the local frame, lower quality is better),
// used to join groups the scans alone cannot join, the way a person would line each up on the map.
export type RegisterOptions = { maxShift?: number; maxYaw?: number; yawStep?: number; gridN?: number; onProgress?: Progress; log?: (line: string) => void; mapScore?: (T: Mat4[], use: boolean[]) => number | null; mapPlace?: (T: Mat4[], use: boolean[]) => { transform: Mat4; quality: number } | null };

type Hypothesis = { cand: Candidate; T: Mat4; rms: number; overlap: number; consistency: number | null; conflictRate: number | null; objects: number | null; texture: number | null; walls: number | null; tilt: number; rank: number };

// Point sets of a group of scans in the current frame: for the coarse search and for ICP.
export type Moving = { feat: FeatPts; src: Float32Array; srcH: Float32Array; srcB: Float32Array | null; k: number; cx: number; cy: number; bbox: [number, number, number, number] };
export function gather(preps: Prep[], T: Mat4[], idx: number[], within: [number, number, number, number] | null): Moving {
  const fx: number[] = [], fh: number[] = [], fb: number[] = [], sx: number[] = [], sh: number[] = [], sb: number[] = [], p = [0, 0, 0];
  const colour = idx.every(i => preps[i].b);
  let cx = 0, cy = 0, n = 0;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const i of idx) {
    const P = preps[i], M = T[i];
    for (let k = 0; k < P.featIdx.length; k++) {
      applyTo(M, P.x, P.featIdx[k] * 3, p);
      if (within && (p[0] < within[0] || p[0] > within[2] || p[1] < within[1] || p[1] > within[3])) continue;
      fx.push(p[0], p[1], p[2]); fh.push(P.h[P.featIdx[k]]); if (colour) fb.push(P.b![P.featIdx[k]]);
      cx += p[0]; cy += p[1]; n++;
      if (p[0] < bbox[0]) bbox[0] = p[0]; if (p[1] < bbox[1]) bbox[1] = p[1]; if (p[0] > bbox[2]) bbox[2] = p[0]; if (p[1] > bbox[3]) bbox[3] = p[1];
    }
    for (let k = 0; k < P.srcIdx.length; k++) {
      applyTo(M, P.x, P.srcIdx[k] * 3, p);
      if (within && (p[0] < within[0] || p[0] > within[2] || p[1] < within[1] || p[1] > within[3])) continue;
      sx.push(p[0], p[1], p[2]); sh.push(P.h[P.srcIdx[k]]); if (colour) sb.push(P.b![P.srcIdx[k]]);
    }
  }
  const feat: FeatPts = { x: Float32Array.from(fx), h: Float32Array.from(fh), b: colour ? Float32Array.from(fb) : null, idx: Uint32Array.from({ length: fh.length }, (_, i) => i) };
  return { feat, src: Float32Array.from(sx), srcH: Float32Array.from(sh), srcB: colour ? Float32Array.from(sb) : null, k: sh.length, cx: n ? cx / n : 0, cy: n ? cy / n : 0, bbox };
}

function fitToTarget(src: Float32Array, srcH: Float32Array, k: number, T0: Mat4, tgt: Target, quick = false): { T: Mat4; rms: number; overlap: number; near: number; tilt: number } {
  const T1 = [...T0]; T1[11] += groundOffset(src, srcH, k, tgt, T0);
  const T4 = icp(src, k, tgt, T1, 4, quick ? 15 : 25, [1.0, 0.3], 0.8);
  let T6 = icp(src, k, tgt, T4, 6, quick ? 12 : 20, [0.4, 0.15], 0.85);
  const tilt = tiltDeg(mul4(T6, inv4(T0)));
  if (tilt > 3) T6 = T4; // a big tilt means the fit wandered; keep the level solution
  return { T: T6, ...icpMetrics(src, k, tgt, T6), tilt };
}

// A transform as heading and shift about a centre, for logs: x' = R(x - c) + c + t.
export function describeRelative(T: Mat4, c: [number, number]): string {
  const tx = T[0] * c[0] + T[1] * c[1] + T[3] - c[0], ty = T[4] * c[0] + T[5] * c[1] + T[7] - c[1];
  return `${yawDeg(T).toFixed(2)}deg (${tx.toFixed(2)}, ${ty.toFixed(2)}, z ${T[11].toFixed(2)})`;
}

const featOf = (P: Prep): FeatPts => ({ x: P.x, h: P.h, b: P.b, idx: P.featIdx });

// Quick score of a placement without ICP, for screening candidates: object agreement, wall fit and texture.
function screen(M: Moving, tgt: Target, cand: Candidate, cB: [number, number]): number {
  const T = yawShift4(cand.yaw * Math.PI / 180, cB[0], cB[1], cand.tx, cand.ty);
  T[11] += groundOffset(M.src, M.srcH, M.k, tgt, T);
  const cons = consistency(M.src, M.srcH, M.k, tgt, T, 2), tex = textureNcc(M.src, M.srcH, M.srcB, M.k, tgt, T), walls = wallFit(M.src, M.srcH, M.k, tgt, T, 0.15);
  const shift = Math.hypot(cand.tx, cand.ty);
  return (cons ? 1.2 * cons.objectAgree - 3.0 * cons.objectConflict + 0.02 * cons.agree - 0.2 * cons.conflict : 0) + (tex ? Math.max(-8, Math.min(8, 0.2 * tex.ncc * Math.sqrt(tex.cells))) : 0) + (walls ? 0.02 * walls.close - 0.03 * (walls.points - walls.close) : 0) - 0.5 * (shift / 10) ** 2 - 0.5 * (cand.yaw / 15) ** 2;
}

// Scores one placement of a moving group against a target: ICP from it, then the checks.
// The rank adds up evidence, so a fit backed by more overlap counts for more: each compact object
// cell that agrees or conflicts, each wall point on or off a wall, and the significance of the
// ground texture correlation. Hard gates reject fits that fail any check outright.
export function evaluateHypothesis(M: Moving, tgt: Target, cand: Candidate, cB: [number, number], quick: boolean): Omit<Hypothesis, "rank"> & { rank: number; ok: boolean; evidence: string } {
  const T0 = yawShift4(cand.yaw * Math.PI / 180, cB[0], cB[1], cand.tx, cand.ty);
  const fit = fitToTarget(M.src, M.srcH, M.k, T0, tgt, quick);
  const cons = consistency(M.src, M.srcH, M.k, tgt, fit.T);
  const tex = textureNcc(M.src, M.srcH, M.srcB, M.k, tgt, fit.T);
  const walls = wallFit(M.src, M.srcH, M.k, tgt, fit.T);
  const shift = Math.hypot(fit.T[0] * cB[0] + fit.T[1] * cB[1] + fit.T[3] - cB[0], fit.T[4] * cB[0] + fit.T[5] * cB[1] + fit.T[7] - cB[1]);
  const yawErr = yawDeg(fit.T);
  const ok = (fit.overlap >= 0.10 || fit.near >= 1500) && fit.rms <= 0.10 && (cons === null || (cons.consistency >= 0.55 && cons.conflictRate <= 0.35)) && (walls === null || walls.fit >= 0.2) && (cons?.objects === null || cons === null || cons.objects >= 0.4);
  const eObjects = cons ? 1.2 * cons.objectAgree - 3.0 * cons.objectConflict : 0;
  const eAll = cons ? 0.02 * cons.agree - 0.2 * cons.conflict : 0;
  const eTexture = tex ? Math.max(-8, Math.min(8, 0.2 * tex.ncc * Math.sqrt(tex.cells))) : 0;
  const eWalls = walls ? 0.02 * walls.close - 0.03 * (walls.points - walls.close) : 0;
  const ePrior = -0.5 * (shift / 10) ** 2 - 0.5 * (yawErr / 15) ** 2;
  const rank = eObjects + eAll + eTexture + eWalls + ePrior - (ok ? 0 : 1000);
  const evidence = `objects ${eObjects.toFixed(0)} (${cons?.objectAgree ?? 0} agree, ${cons?.objectConflict ?? 0} conflict), all ${eAll.toFixed(0)}, texture ${eTexture.toFixed(0)} (${tex?.cells ?? 0} cells), walls ${eWalls.toFixed(0)} (${walls?.close ?? 0} of ${walls?.points ?? 0}), prior ${ePrior.toFixed(0)}`;
  return { cand, ...fit, consistency: cons?.consistency ?? null, conflictRate: cons?.conflictRate ?? null, objects: cons?.objects ?? null, texture: tex?.ncc ?? null, walls: walls?.fit ?? null, rank, ok, evidence };
}
export function describeHypothesis(h: ReturnType<typeof evaluateHypothesis>, cB: [number, number]) {
  return `${h.cand.yaw.toFixed(1)}deg (${h.cand.tx.toFixed(2)}, ${h.cand.ty.toFixed(2)}) -> ${describeRelative(h.T, cB)}: rms ${(h.rms * 100).toFixed(1)} cm, overlap ${h.overlap.toFixed(2)}, consistency ${h.consistency?.toFixed(2) ?? "n/a"}, conflicts ${h.conflictRate?.toFixed(2) ?? "n/a"}, objects ${h.objects?.toFixed(2) ?? "n/a"}, texture ${h.texture?.toFixed(2) ?? "n/a"}, walls ${h.walls?.toFixed(2) ?? "n/a"}, tilt ${h.tilt.toFixed(2)}deg | rank ${h.rank.toFixed(0)}: ${h.evidence}${h.ok ? "" : " (rejected)"}`;
}

// Registers the scans in `moving` (as one rigid group) against the scans in `fixed`. Returns the group transform, or null.
type Opts = Required<Omit<RegisterOptions, "onProgress" | "log" | "mapScore" | "mapPlace">>;
function registerGroup(moving: number[], fixed: number[], preps: Prep[], T: Mat4[], o: Opts, log: (s: string) => void): (Hypothesis & { alternatives: Hypothesis[] }) | null {
  const name = moving.map(i => preps[i].name).join("+");
  const B = gather(preps, T, moving, null);
  const reach = o.maxShift + 5;
  const within: [number, number, number, number] = [B.bbox[0] - reach, B.bbox[1] - reach, B.bbox[2] + reach, B.bbox[3] + reach];
  const A = gather(preps, T, fixed, within);
  if (A.feat.idx.length < 500) { log(`${name}: no placed scan within ${reach} m of its phone position`); return null; }
  const useColour = !!A.feat.b && !!B.feat.b;
  const Af: FeatPts = { ...A.feat, b: useColour ? A.feat.b : null }, Bf: FeatPts = { ...B.feat, b: useColour ? B.feat.b : null };
  const yaws: number[] = [];
  for (let y = -o.maxYaw; y <= o.maxYaw + 1e-9; y += o.yawStep) yaws.push(y);
  const cB: [number, number] = [B.cx, B.cy];
  let t0 = Date.now();
  const coarse = coarseSearch(Af, Bf, cB, yaws, o.maxShift, o.gridN, 20);
  log(`${name}: coarse ${coarse.length} candidates in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${coarse.map(c => `${c.yaw.toFixed(1)}deg (${c.tx.toFixed(1)}, ${c.ty.toFixed(1)}) ${c.score.toFixed(3)}`).join("; ")}`);
  t0 = Date.now();
  const refined = coarse.map(c => refineCandidate(Af, Bf, cB, c) ?? c);
  log(`${name}: refined in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${refined.map(c => `${c.yaw.toFixed(1)}deg (${c.tx.toFixed(2)}, ${c.ty.toFixed(2)})`).join("; ")}`);
  t0 = Date.now();
  const tgt = buildTarget(fixed.map(i => preps[i]), fixed.map(i => T[i]), within);
  if (tgt.m < 500) return null;
  const Bsrc: Moving = { ...B, srcB: useColour ? B.srcB : null };
  // Screen without ICP: the checks at the refined pose, tolerant of a few decimetres.
  const screened = refined.map(cand => ({ cand, score: screen(Bsrc, tgt, cand, cB) })).sort((a, b) => b.score - a.score);
  log(`${name}: screened: ${screened.slice(0, 10).map(x => `${x.cand.yaw.toFixed(1)}deg (${x.cand.tx.toFixed(1)}, ${x.cand.ty.toFixed(1)}) ${x.score.toFixed(0)}`).join("; ")}`);
  const hyps: (Hypothesis & { ok: boolean })[] = [];
  for (const { cand } of screened.slice(0, 6)) {
    const T0 = yawShift4(cand.yaw * Math.PI / 180, cB[0], cB[1], cand.tx, cand.ty);
    if (hyps.some(h => rotationDeg(mul4(h.T, inv4(T0))) < 1.5 && Math.hypot(h.T[3] - T0[3], h.T[7] - T0[7]) < 0.8)) continue; // starts where another ended
    const h = evaluateHypothesis(Bsrc, tgt, cand, cB, true);
    if (hyps.some(g => rotationDeg(mul4(g.T, inv4(h.T))) < 0.3 && Math.hypot(g.T[3] - h.T[3], g.T[7] - h.T[7]) < 0.15)) { log(`${name}: ${cand.yaw.toFixed(1)}deg (${cand.tx.toFixed(2)}, ${cand.ty.toFixed(2)}) ends where an earlier one did`); continue; }
    hyps.push(h);
    log(`${name}: hypothesis ${describeHypothesis(h, cB)}`);
  }
  log(`${name}: ${hyps.length} hypotheses tested in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  hyps.sort((a, b) => b.rank - a.rank);
  if (!hyps.length || hyps[0].rank <= -500) return null;
  const best = hyps[0], full = fitToTarget(Bsrc.src, Bsrc.srcH, Bsrc.k, best.T, tgt);
  // Alternatives the scans alone cannot rule out: passed the checks and scored within 8 of the best.
  const alternatives = hyps.slice(1).filter(h => h.ok && h.rank >= best.rank - 8).slice(0, 3);
  return { ...best, ...full, alternatives };
}

// Joins two groups by placing each on the map, then refining the relative pose with ICP and the checks.
function mapMerge(moving: number[], fixed: number[], preps: Prep[], T: Mat4[], o: Opts, mapPlace: NonNullable<RegisterOptions["mapPlace"]>, log: (s: string) => void): Hypothesis | null {
  const name = moving.map(i => preps[i].name).join("+");
  const Pf = mapPlace(T, preps.map((_, k) => fixed.includes(k))), Pm = mapPlace(T, preps.map((_, k) => moving.includes(k)));
  if (!Pf || !Pm) { log(`${name}: the map could not place ${!Pf ? "the fixed group" : "the moving group"}`); return null; }
  // Moving group into the fixed group's frame: undo the fixed placement after the moving placement.
  const D = mul4(inv4(Pf.transform), Pm.transform);
  const B = gather(preps, T, moving, null), cB: [number, number] = [B.cx, B.cy];
  const reach = o.maxShift + 5;
  const within: [number, number, number, number] = [B.bbox[0] - reach, B.bbox[1] - reach, B.bbox[2] + reach, B.bbox[3] + reach];
  const A = gather(preps, T, fixed, within);
  const tgt = buildTarget(fixed.map(i => preps[i]), fixed.map(i => T[i]), within);
  if (tgt.m < 500 || A.feat.idx.length < 500) return null;
  const start: Candidate = { yaw: yawDeg(D), tx: D[0] * cB[0] + D[1] * cB[1] + D[3] - cB[0], ty: D[4] * cB[0] + D[5] * cB[1] + D[7] - cB[1], score: 0, overlap_m2: 0 };
  log(`${name}: map places it at ${start.yaw.toFixed(1)}deg (${start.tx.toFixed(2)}, ${start.ty.toFixed(2)}) relative to the group it joins (map quality ${Pf.quality.toFixed(2)} and ${Pm.quality.toFixed(2)})`);
  // Settle on the scans: 10 cm rasters within 2.5 m and 3 degrees, then ICP and the checks.
  const useColour = !!A.feat.b && !!B.feat.b;
  const cand = refineCandidate({ ...A.feat, b: useColour ? A.feat.b : null }, { ...B.feat, b: useColour ? B.feat.b : null }, cB, start, 2.5, 3) ?? start;
  const h = evaluateHypothesis({ ...B, srcB: useColour ? B.srcB : null }, tgt, cand, cB, false);
  log(`${name}: map-guided ${describeHypothesis(h, cB)}`);
  const moved = Math.hypot(h.T[0] * cB[0] + h.T[1] * cB[1] + h.T[3] - cB[0] - start.tx, h.T[4] * cB[0] + h.T[5] * cB[1] + h.T[7] - cB[1] - start.ty);
  const turned = Math.abs(yawDeg(h.T) - start.yaw);
  // Accept when the scans do not contradict the map placement: a clean fit that stayed near where the map put it.
  const clean = h.rms <= 0.10 && (h.conflictRate === null || h.conflictRate <= 0.35) && (h.objects === null || h.objects >= 0.4);
  if (!clean || moved > 3.5 || turned > 6) { log(`${name}: map-guided join rejected (moved ${moved.toFixed(1)} m, turned ${turned.toFixed(1)} deg${clean ? "" : ", checks failed"})`); return null; }
  return h;
}

export function registerPrepared(preps: Prep[], origin: [number, number, number], options: RegisterOptions = {}): Registration {
  const start = Date.now();
  const o = { maxShift: options.maxShift ?? 20, maxYaw: options.maxYaw ?? 45, yawStep: options.yawStep ?? 2.5, gridN: options.gridN ?? 256 };
  const progress = options.onProgress ?? (() => {}), log = options.log ?? (() => {});
  const notes: string[] = [];
  const T: Mat4[] = preps.map(() => identity4());
  const metrics: { rms: number | null; overlap: number | null; consistency: number | null }[] = preps.map(() => ({ rms: null, overlap: null, consistency: null }));
  // Anchor: the densest scan. Its phone position and heading set the frame.
  let anchor = 0;
  preps.forEach((P, i) => { if (P.n > preps[anchor].n) anchor = i; });
  // Groups of scans fitted together. Pairs are tried nearest first by phone position, so the strongest
  // overlaps join first and a weak pair is fitted with the evidence of whole groups on both sides.
  const group = preps.map((_, i) => i);
  const find = (i: number): number => group[i] === i ? i : (group[i] = find(group[i]));
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < preps.length; i++) for (let j = i + 1; j < preps.length; j++) pairs.push({ i, j, d: Math.hypot(preps[i].cx - preps[j].cx, preps[i].cy - preps[j].cy) });
  pairs.sort((a, b) => a.d - b.d);
  const failed = new Set<string>();
  for (const { i, j } of pairs) {
    const gi = find(i), gj = find(j);
    if (gi === gj) continue;
    const key = [gi, gj].sort().join(":");
    if (failed.has(key)) continue;
    const members = (g: number) => preps.map((_, k) => k).filter(k => find(k) === g);
    const mi = members(gi), mj = members(gj);
    const points = (m: number[]) => m.reduce((n, k) => n + preps[k].n, 0);
    // The group with the anchor stays fixed; otherwise the bigger one does.
    const fixedFirst = mi.includes(anchor) || (!mj.includes(anchor) && points(mi) >= points(mj));
    const fixed = fixedFirst ? mi : mj, moving = fixedFirst ? mj : mi;
    progress(`Matching ${moving.map(k => preps[k].name).join(" and ")} to ${fixed.map(k => preps[k].name).join(" and ")}`);
    let hyp: (Hypothesis & { alternatives: Hypothesis[] }) | null = registerGroup(moving, fixed, preps, T, o, log);
    if (!hyp && options.mapPlace) {
      // The scans alone cannot join these groups: place each on the map and join them that way.
      progress(`Placing ${moving.map(k => preps[k].name).join(" and ")} on the map`);
      const viaMap = mapMerge(moving, fixed, preps, T, o, options.mapPlace, log);
      if (viaMap) { hyp = { ...viaMap, alternatives: [] }; notes.push(`${moving.map(k => preps[k].name).join(" and ")} share too little with the other scans to fit directly, so the map placed them.`); }
    }
    if (!hyp) { failed.add(key); log(`${moving.map(k => preps[k].name).join("+")}: no consistent hypothesis against ${fixed.map(k => preps[k].name).join("+")}`); continue; }
    if (hyp.alternatives.length && options.mapScore) {
      // The scans alone cannot separate these: the map decides.
      progress("Checking two possible fits against the map");
      const use = preps.map((_, k) => moving.includes(k) || fixed.includes(k));
      const scored = [hyp, ...hyp.alternatives].map(h => { const Th = T.map((t, k) => moving.includes(k) ? mul4(h.T, t) : t); return { h, map: options.mapScore!(Th, use) }; });
      log(`map check: ${scored.map(x => `${describeRelative(x.h.T, [0, 0])} rank ${x.h.rank.toFixed(0)} map ${x.map === null ? "n/a" : x.map.toFixed(3)}`).join(" | ")}`);
      const valid = scored.filter(x => x.map !== null);
      if (valid.length) { valid.sort((a, b) => a.map! - b.map!); if (valid[0].h !== hyp) { log(`map check chose an alternative for ${moving.map(k => preps[k].name).join("+")}`); notes.push(`${moving.map(k => preps[k].name).join(" and ")}: the scans alone could not fix the position along the street, so the map decided it.`); } hyp = { ...valid[0].h, alternatives: [] }; }
    }
    for (const k of moving) { T[k] = mul4(hyp.T, T[k]); metrics[k] = { rms: hyp.rms, overlap: hyp.overlap, consistency: hyp.consistency }; }
    group[find(moving[0])] = find(fixed[0]);
  }
  const status: ScanFit["status"][] = preps.map((_, i) => i === anchor ? "anchor" : find(i) === find(anchor) ? "registered" : "gps-only");
  preps.forEach((P, i) => { if (status[i] === "gps-only") { T[i] = identity4(); notes.push(`${P.name} found no reliable match to the other scans, so it keeps its phone position.`); } });
  // Joint refinement: each placed scan against all the others.
  const joined = preps.map((_, i) => i).filter(i => status[i] === "registered");
  for (let round = 0; round < 3 && joined.length; round++) {
    progress("Refining the fit between scans");
    let maxMove = 0;
    for (const i of joined) {
      const others = preps.map((_, j) => j).filter(j => j !== i && status[j] !== "gps-only");
      const bb = bboxOf(featOf(preps[i]), null);
      const T0 = T[i], c = [0, 0, 0];
      applyTo(T0, Float32Array.from([preps[i].cx, preps[i].cy, 0]), 0, c);
      const half = Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 3;
      const tgt = buildTarget(others.map(j => preps[j]), others.map(j => T[j]), [c[0] - half, c[1] - half, c[0] + half, c[1] + half]);
      if (tgt.m < 500) continue;
      const src = transformPoints(identity4(), preps[i].x, preps[i].srcIdx), k = preps[i].srcIdx.length;
      const Tn = icp(src, k, tgt, T0, 6, 20, [0.3, 0.1], 0.85);
      const d = mul4(Tn, inv4(T0));
      if (tiltDeg(Tn) > 4) continue;
      maxMove = Math.max(maxMove, Math.hypot(d[3], d[7], d[11]));
      T[i] = Tn;
      const m = icpMetrics(src, k, tgt, Tn);
      metrics[i] = { rms: m.rms, overlap: m.overlap, consistency: consistency(src, Float32Array.from(preps[i].srcIdx, q => preps[i].h[q]), k, tgt, Tn)?.consistency ?? null };
      log(`joint round ${round} ${preps[i].name}: moved ${(Math.hypot(d[3], d[7], d[11]) * 100).toFixed(1)} cm, rms ${(m.rms * 100).toFixed(1)} cm, overlap ${m.overlap.toFixed(2)}`);
    }
    if (maxMove < 0.01) break;
  }
  const fits: ScanFit[] = preps.map((P, i) => {
    const d = T[i];
    const moved = Math.hypot(d[0] * P.cx + d[1] * P.cy + d[3] - P.cx, d[4] * P.cx + d[5] * P.cy + d[7] - P.cy);
    const turned = yawDeg(d);
    const note = status[i] === "anchor" ? "Anchor scan: the others are fitted to it."
      : status[i] === "registered" ? `Fitted to the other scans: moved ${moved.toFixed(1)} m and turned ${Math.abs(turned).toFixed(1)} degrees from the phone position.`
      : "No reliable match to the other scans. Kept at the phone position.";
    // To map coordinates: shift into the local frame, transform, shift back.
    const S: Mat4 = [1, 0, 0, -origin[0], 0, 1, 0, -origin[1], 0, 0, 1, -origin[2], 0, 0, 0, 1], Si = [1, 0, 0, origin[0], 0, 1, 0, origin[1], 0, 0, 1, origin[2], 0, 0, 0, 1];
    return { name: P.name, points: P.count, status: status[i], transform: mul4(Si, mul4(d, S)), centre_raw: [P.cx + origin[0], P.cy + origin[1]], moved_m: Math.round(moved * 100) / 100, turned_deg: Math.round(turned * 10) / 10, rms_m: metrics[i].rms === null ? null : Math.round(metrics[i].rms * 1000) / 1000, overlap: metrics[i].overlap === null ? null : Math.round(metrics[i].overlap * 100) / 100, consistency: metrics[i].consistency === null ? null : Math.round(metrics[i].consistency * 100) / 100, note };
  });
  return { origin, fits, local: T, notes, seconds: Math.round((Date.now() - start) / 100) / 10 };
}

export function localOrigin(scan: ScanInput): [number, number, number] {
  let mx = 0, my = 0;
  const step = Math.max(1, Math.floor(scan.count / 10000));
  let c = 0;
  for (let i = 0; i < scan.count; i += step) { mx += scan.xyz[i * 3]; my += scan.xyz[i * 3 + 1]; c++; }
  return [Math.floor(mx / c / 100) * 100, Math.floor(my / c / 100) * 100, 0];
}

// Registers raw scans (map coordinates) to each other.
export function registerScans(scans: ScanInput[], options: RegisterOptions = {}): { registration: Registration; preps: Prep[] } {
  if (!scans.length) throw new Error("No scans to register.");
  const origin = localOrigin(scans[0]);
  const preps = scans.map((s, i) => { options.onProgress?.(`Preparing scan ${i + 1} of ${scans.length}`); return prepareScan(s, origin); });
  return { registration: registerPrepared(preps, origin, options), preps };
}
