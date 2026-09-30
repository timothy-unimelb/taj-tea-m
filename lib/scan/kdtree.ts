// A k-d tree over 3D points for nearest-neighbour queries in the ICP steps.
// Points stay in the caller's array; the tree holds an index permutation.

export class KdTree {
  private idx: Uint32Array;
  private axis: Uint8Array;
  constructor(private pts: Float32Array | Float64Array, public readonly count: number) {
    this.idx = new Uint32Array(count);
    for (let i = 0; i < count; i++) this.idx[i] = i;
    this.axis = new Uint8Array(count);
    this.build(0, count);
  }

  private build(lo: number, hi: number) {
    if (hi - lo <= 1) return;
    const { pts, idx } = this;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = lo; i < hi; i++) for (let k = 0; k < 3; k++) { const x = pts[idx[i] * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    let axis = 0;
    for (let k = 1; k < 3; k++) if (max[k] - min[k] > max[axis] - min[axis]) axis = k;
    const mid = (lo + hi) >> 1;
    this.select(lo, hi - 1, mid, axis);
    this.axis[mid] = axis;
    this.build(lo, mid);
    this.build(mid + 1, hi);
  }

  // Quickselect: puts the k-th smallest (by `axis`) of idx[lo..hi] at position k.
  private select(lo: number, hi: number, k: number, axis: number) {
    const { pts, idx } = this;
    while (hi > lo) {
      const pivot = pts[idx[(lo + hi) >> 1] * 3 + axis];
      let i = lo, j = hi;
      while (i <= j) {
        while (pts[idx[i] * 3 + axis] < pivot) i++;
        while (pts[idx[j] * 3 + axis] > pivot) j--;
        if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; }
      }
      if (k <= j) hi = j; else if (k >= i) lo = i; else return;
    }
  }

  // Index of the nearest point within `maxDist`, or -1. `out[0]` gets the squared distance.
  nearest(x: number, y: number, z: number, maxDist: number, out?: Float64Array): number {
    this.bestD2 = maxDist * maxDist; this.bestI = -1;
    this.qx = x; this.qy = y; this.qz = z;
    this.search(0, this.count);
    if (out) out[0] = this.bestD2;
    return this.bestI;
  }
  private bestD2 = 0; private bestI = -1; private qx = 0; private qy = 0; private qz = 0;
  private search(lo: number, hi: number) {
    if (hi <= lo) return;
    const mid = (lo + hi) >> 1, { pts, idx } = this, p = idx[mid] * 3;
    const dx = pts[p] - this.qx, dy = pts[p + 1] - this.qy, dz = pts[p + 2] - this.qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < this.bestD2) { this.bestD2 = d2; this.bestI = idx[mid]; }
    if (hi - lo === 1) return;
    const axis = this.axis[mid], diff = axis === 0 ? this.qx - pts[p] : axis === 1 ? this.qy - pts[p + 1] : this.qz - pts[p + 2];
    if (diff < 0) { this.search(lo, mid); if (diff * diff < this.bestD2) this.search(mid + 1, hi); }
    else { this.search(mid + 1, hi); if (diff * diff < this.bestD2) this.search(lo, mid); }
  }

  // Up to k nearest points within `maxDist`, nearest first. Returns their indices.
  knn(x: number, y: number, z: number, k: number, maxDist: number): number[] {
    this.kIdx = []; this.kD2 = []; this.kMax = k; this.kLimit = maxDist * maxDist;
    this.qx = x; this.qy = y; this.qz = z;
    this.searchK(0, this.count);
    return this.kIdx;
  }
  private kIdx: number[] = []; private kD2: number[] = []; private kMax = 0; private kLimit = 0;
  private searchK(lo: number, hi: number) {
    if (hi <= lo) return;
    const mid = (lo + hi) >> 1, { pts, idx } = this, p = idx[mid] * 3;
    const dx = pts[p] - this.qx, dy = pts[p + 1] - this.qy, dz = pts[p + 2] - this.qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const bound = this.kIdx.length < this.kMax ? this.kLimit : Math.min(this.kLimit, this.kD2[this.kD2.length - 1]);
    if (d2 < bound) {
      let i = this.kD2.length;
      while (i > 0 && this.kD2[i - 1] > d2) i--;
      this.kD2.splice(i, 0, d2); this.kIdx.splice(i, 0, idx[mid]);
      if (this.kIdx.length > this.kMax) { this.kIdx.pop(); this.kD2.pop(); }
    }
    if (hi - lo === 1) return;
    const axis = this.axis[mid], diff = axis === 0 ? this.qx - pts[p] : axis === 1 ? this.qy - pts[p + 1] : this.qz - pts[p + 2];
    const far = () => this.kIdx.length < this.kMax ? this.kLimit : Math.min(this.kLimit, this.kD2[this.kD2.length - 1]);
    if (diff < 0) { this.searchK(lo, mid); if (diff * diff < far()) this.searchK(mid + 1, hi); }
    else { this.searchK(mid + 1, hi); if (diff * diff < far()) this.searchK(lo, mid); }
  }
}
