// Fast Fourier transforms on square grids, for the scan registration's
// cross-correlation searches. Sizes are powers of two. Grids are stored
// row-major with axis 0 = x (east) and axis 1 = y (north), so index
// i * n + j is cell (i, j).

const plans = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array }>();

function plan(n: number) {
  let p = plans.get(n);
  if (p) return p;
  const bits = Math.log2(n);
  if (!Number.isInteger(bits)) throw new Error(`FFT size ${n} is not a power of two.`);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = Math.sin(2 * Math.PI * k / n); }
  p = { rev, cos, sin };
  plans.set(n, p);
  return p;
}

// In-place complex FFT of one line of n values at stride `stride` from `offset`. `inverse` also scales by 1/n.
function fft1(re: Float64Array, im: Float64Array, offset: number, stride: number, n: number, inverse: boolean) {
  const { rev, cos, sin } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const a = offset + i * stride, b = offset + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = inverse ? sin[k * step] : -sin[k * step];
        const a = offset + (start + k) * stride, b = offset + (start + k + half) * stride;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { const a = offset + i * stride; re[a] /= n; im[a] /= n; }
}

// In-place 2D complex FFT of an n x n grid.
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse = false) {
  for (let i = 0; i < n; i++) fft1(re, im, i * n, 1, n, inverse);
  for (let j = 0; j < n; j++) fft1(re, im, j, n, n, inverse);
}

export type Spectrum = { re: Float64Array; im: Float64Array };

// Spectra of two real grids from one complex FFT: X = FFT(x), Y = FFT(y).
export function fft2Pair(x: Float64Array, y: Float64Array | null, n: number): [Spectrum, Spectrum] {
  const re = Float64Array.from(x), im = y ? Float64Array.from(y) : new Float64Array(n * n);
  fft2(re, im, n);
  const X = { re: new Float64Array(n * n), im: new Float64Array(n * n) }, Y = { re: new Float64Array(n * n), im: new Float64Array(n * n) };
  for (let i = 0; i < n; i++) {
    const ni = i === 0 ? 0 : n - i;
    for (let j = 0; j < n; j++) {
      const nj = j === 0 ? 0 : n - j, k = i * n + j, m = ni * n + nj;
      X.re[k] = (re[k] + re[m]) / 2; X.im[k] = (im[k] - im[m]) / 2;
      Y.re[k] = (im[k] + im[m]) / 2; Y.im[k] = (re[m] - re[k]) / 2;
    }
  }
  return [X, Y];
}

// Inverse transforms of two spectra with real results, from one complex inverse FFT.
export function ifft2Pair(P: Spectrum, Q: Spectrum, n: number): [Float64Array, Float64Array] {
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  for (let k = 0; k < n * n; k++) { re[k] = P.re[k] - Q.im[k]; im[k] = P.im[k] + Q.re[k]; }
  fft2(re, im, n, true);
  return [re, im];
}

// P * conj(Q), added into `out` (or a new spectrum).
export function mulConj(P: Spectrum, Q: Spectrum, out?: Spectrum): Spectrum {
  const n = P.re.length;
  const o = out ?? { re: new Float64Array(n), im: new Float64Array(n) };
  for (let k = 0; k < n; k++) {
    o.re[k] += P.re[k] * Q.re[k] + P.im[k] * Q.im[k];
    o.im[k] += P.im[k] * Q.re[k] - P.re[k] * Q.im[k];
  }
  return o;
}

export function addSpectrum(a: Spectrum, b: Spectrum): Spectrum {
  const re = Float64Array.from(a.re), im = Float64Array.from(a.im);
  for (let k = 0; k < re.length; k++) { re[k] += b.re[k]; im[k] += b.im[k]; }
  return { re, im };
}

export function nextPow2(x: number) { let n = 1; while (n < x) n <<= 1; return n; }
