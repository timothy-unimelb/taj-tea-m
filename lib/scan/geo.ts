// Map maths for scan registration: UTM (metres) to and from latitude and
// longitude, and which UTM zone a LAS file's EPSG code means. Scaniverse
// writes WGS 84 / UTM, for Melbourne zone 55 south (EPSG:32755).

const A = 6378137.0, F = 1 / 298.257223563, K0 = 0.9996;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);

export type UtmZone = { zone: number; south: boolean };

export function utmZoneFromEpsg(epsg: number | null): UtmZone | null {
  if (epsg === null) return null;
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  if (epsg >= 28348 && epsg <= 28358) return { zone: epsg - 28300, south: true }; // GDA94 / MGA
  if (epsg >= 7846 && epsg <= 7859) return { zone: epsg - 7800, south: true };    // GDA2020 / MGA
  if (epsg >= 26901 && epsg <= 26923) return { zone: epsg - 26900, south: false }; // NAD83 / UTM
  if (epsg >= 25828 && epsg <= 25838) return { zone: epsg - 25800, south: false }; // ETRS89 / UTM
  return null;
}

export function llToUtm(lat: number, lon: number, z: UtmZone): { e: number; n: number } {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180, lam0 = ((z.zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin), T = tan * tan, C = EP2 * cos * cos, Aa = cos * (lam - lam0);
  const M = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
  const e = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000;
  let n = K0 * (M + N * tan * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  if (z.south) n += 10000000;
  return { e, n };
}

export function utmToLl(e: number, n: number, z: UtmZone): { lat: number; lon: number } {
  const x = e - 500000, y = z.south ? n - 10000000 : n, lam0 = ((z.zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const M = y / K0, mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * sin * sin), T1 = tan * tan, C1 = EP2 * cos * cos, R1 = A * (1 - E2) / (1 - E2 * sin * sin) ** 1.5, D = x / (N1 * K0);
  const lat = phi1 - (N1 * tan / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lam0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / cos;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
