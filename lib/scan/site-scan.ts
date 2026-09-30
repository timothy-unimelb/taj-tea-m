// One site scan from several uploaded scans, with no manual step: read the
// LAS files, register the scans to each other (register.ts), place the
// result on the map from reference data (georef.ts), and write one
// georeferenced LAS file plus a report of what was done and how well it fit.
//
// The browser calls `registerScanFiles`; the command-line tool in
// tools/scan_register/ calls `buildSiteScan` with the same code.

import { utmToLl, utmZoneFromEpsg } from "./geo";
import { georeference, mapScore, placeSite, prepareReference, siteFeatures, type Placement, type Reference, type ReferencePrep } from "./georef";
import { readLas, writeLas, type LasCloud } from "./las";
import { identity4, localOrigin, mul4, prepareScan, registerPrepared, type Mat4, type Progress, type RegisterOptions, type ScanFit } from "./register";

export type { Reference } from "./georef";

export type SiteScanReport = {
  points: number;
  epsg: number | null;
  origin: [number, number, number];                // local frame origin (map coordinates)
  centre: { lat: number; lon: number } | null;   // of the placed scan
  scans: ScanFit[];                                // final transforms (raw file to placed map coordinates)
  scans_relative: Mat4[];                          // transforms before the map placement
  placement: Omit<Placement, "transform"> & { source: string | null };
  notes: string[];
  seconds: number;
};

export type SiteScanOptions = {
  georef?: "skip" | "fetch" | { reference: Reference };
  fetchReference?: (lat: number, lon: number, radius: number) => Promise<Reference>;
  onProgress?: Progress;
  log?: (line: string) => void;
  register?: RegisterOptions;
};

async function defaultFetch(lat: number, lon: number, radius: number): Promise<Reference> {
  if (typeof window === "undefined") { const m = await import("./reference"); return m.fetchReference(lat, lon, radius); }
  const res = await fetch(`/api/reference-features?${new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) })}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

export async function buildSiteScan(inputs: { name: string; buffer: ArrayBuffer }[], options: SiteScanOptions = {}): Promise<{ las: Uint8Array; report: SiteScanReport }> {
  const start = Date.now(), progress = options.onProgress ?? (() => {}), log = options.log ?? (() => {}), notes: string[] = [];
  progress("Reading the scans");
  const clouds: LasCloud[] = inputs.map(i => readLas(i.buffer, i.name));
  const epsg = clouds.find(c => c.epsg !== null)?.epsg ?? null;
  const zone = utmZoneFromEpsg(epsg);
  if (!zone) throw new Error("The scans have no map projection, so they can't be placed. Export them from the scanning app with location on.");
  if (clouds.some(c => c.epsg !== null && c.epsg !== epsg)) throw new Error("The scans use different map projections.");
  // Map data first: it also settles fits the scans alone cannot.
  const inputsRaw = clouds.map(c => ({ name: c.name, xyz: c.xyz, rgb: c.rgb, count: c.count }));
  const origin = localOrigin(inputsRaw[0]);
  const preps = inputsRaw.map((sc, i) => { progress(`Preparing scan ${i + 1} of ${inputsRaw.length}`); return prepareScan(sc, origin); });
  let anchor = 0;
  preps.forEach((P, i) => { if (P.n > preps[anchor].n) anchor = i; });
  const centreLocal = [preps[anchor].cx + origin[0], preps[anchor].cy + origin[1]];
  const phoneCentre = utmToLl(centreLocal[0], centreLocal[1], zone);
  let reference: Reference | null = null, refPrep: ReferencePrep | null = null;
  if (options.georef && options.georef !== "skip") {
    if (options.georef === "fetch") {
      progress("Fetching map data around the site");
      try { reference = await (options.fetchReference ?? defaultFetch)(phoneCentre.lat, phoneCentre.lon, 150); }
      catch (error) { notes.push(`Map data could not be fetched (${error instanceof Error ? error.message : String(error)}), so the site keeps its phone position.`); }
    } else reference = options.georef.reference;
    if (reference) refPrep = prepareReference(reference, zone, origin);
  }
  const registration = registerPrepared(preps, origin, {
    ...options.register, onProgress: progress, log,
    mapScore: refPrep ? (T, use) => mapScore(preps, T, use, refPrep!, log) : undefined,
    mapPlace: refPrep ? (T, use) => { const p = placeSite(siteFeatures(preps, T, use), refPrep!, log); return p.applied && p.mean_distance_m !== null ? { transform: p.transform, quality: p.mean_distance_m } : null; } : undefined,
  });
  notes.push(...registration.notes);
  const relative = registration.fits.map(f => f.transform);
  // Map placement on the scans that fitted together.
  let placement: SiteScanReport["placement"] = { applied: false, yaw_deg: 0, shift_m: 0, wall_fit: null, kerb_fit: null, mean_distance_m: null, runner_up_m: null, note: "Map placement skipped. Position is the phone's.", source: null };
  let G: Mat4 = identity4();
  const use = registration.fits.map(f => f.status !== "gps-only");
  if (reference) {
    progress("Placing the site scan on the map");
    const p = georeference(preps, registration.local, use, registration.origin, zone, reference, log);
    G = p.transform;
    placement = { applied: p.applied, yaw_deg: p.yaw_deg, shift_m: p.shift_m, wall_fit: p.wall_fit, kerb_fit: p.kerb_fit, mean_distance_m: p.mean_distance_m, runner_up_m: p.runner_up_m, note: p.note, source: reference.source };
  }
  // Final transforms in map coordinates, and the merged cloud.
  const O = registration.origin;
  const S: Mat4 = [1, 0, 0, -O[0], 0, 1, 0, -O[1], 0, 0, 1, -O[2], 0, 0, 0, 1], Si: Mat4 = [1, 0, 0, O[0], 0, 1, 0, O[1], 0, 0, 1, O[2], 0, 0, 0, 1];
  const Gmap = mul4(Si, mul4(G, S));
  progress("Writing the site scan");
  const fits = registration.fits.map((f, i) => ({ ...f, transform: use[i] ? mul4(Gmap, f.transform) : f.transform }));
  clouds.forEach((c, i) => {
    const T = fits[i].transform;
    for (let k = 0; k < c.count; k++) {
      const x = c.xyz[k * 3], y = c.xyz[k * 3 + 1], z = c.xyz[k * 3 + 2];
      c.xyz[k * 3] = T[0] * x + T[1] * y + T[2] * z + T[3];
      c.xyz[k * 3 + 1] = T[4] * x + T[5] * y + T[6] * z + T[7];
      c.xyz[k * 3 + 2] = T[8] * x + T[9] * y + T[10] * z + T[11];
    }
  });
  const las = writeLas(clouds, clouds[0].vlr);
  const c = [Gmap[0] * centreLocal[0] + Gmap[1] * centreLocal[1] + Gmap[3], Gmap[4] * centreLocal[0] + Gmap[5] * centreLocal[1] + Gmap[7]];
  const centre = utmToLl(c[0], c[1], zone);
  const report: SiteScanReport = { points: clouds.reduce((n, cl) => n + cl.count, 0), epsg, origin: O, centre: { lat: Math.round(centre.lat * 1e6) / 1e6, lon: Math.round(centre.lon * 1e6) / 1e6 }, scans: fits, scans_relative: relative, placement, notes, seconds: Math.round((Date.now() - start) / 100) / 10 };
  return { las, report };
}

// Browser entry: several uploaded scans in, one registered site scan out.
export async function registerScanFiles(files: File[], onProgress?: Progress): Promise<{ file: File; report: SiteScanReport }> {
  const inputs = await Promise.all(files.map(async f => ({ name: f.name, buffer: await f.arrayBuffer() })));
  const { las, report } = await buildSiteScan(inputs, { georef: "fetch", onProgress });
  return { file: new File([las as BlobPart], "site-scan.las", { type: "application/octet-stream" }), report };
}

// One plain paragraph on what the registration did, for the scan screens.
export function summariseSiteScan(report: SiteScanReport): string {
  const n = report.scans.length, fitted = report.scans.filter(s => s.status === "registered"), kept = report.scans.filter(s => s.status === "gps-only");
  const parts: string[] = [];
  if (n > 1) {
    const rms = fitted.map(s => s.rms_m).filter((r): r is number => r !== null);
    const worst = rms.length ? Math.max(...rms) : null;
    parts.push(`${n} scans fitted together${worst !== null ? ` to within ${Math.round(worst * 100)} cm` : ""}.`);
    if (kept.length) parts.push(`${kept.length === 1 ? `${kept[0].name} shares` : `${kept.length} scans share`} too little with the others to fit, so ${kept.length === 1 ? "it keeps its" : "they keep their"} phone position.`);
  }
  parts.push(report.placement.applied ? `Placed on the map: moved ${report.placement.shift_m.toFixed(1)} m and turned ${Math.abs(report.placement.yaw_deg).toFixed(0)} degrees from the phone position.` : "Position is the phone's, within about 15 m. The map did not confirm a closer fit.");
  return parts.join(" ");
}
