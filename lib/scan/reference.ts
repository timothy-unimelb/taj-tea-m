// Fetches the map data the scan placement matches against, around one
// point: building outlines, footpath outlines and street trees. City of
// Melbourne open data (CC BY 4.0) where it covers the site, otherwise
// OpenStreetMap buildings and trees via the Overpass API (ODbL). Runs on
// the server (app/api/reference-features) so keys and user agents stay
// there; the browser calls the route.

import type { Reference } from "./georef";

const COM = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const AGENT = "barrier-brain/0.1 (hackathon scan placement)";

type Ring = [number, number][];
type Geometry = { type: string; coordinates: unknown };

function ringsOf(g: Geometry | undefined): Ring[] {
  if (!g) return [];
  if (g.type === "Polygon") return [(g.coordinates as Ring[])[0]];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).map(p => p[0]);
  if (g.type === "LineString") return [g.coordinates as Ring];
  if (g.type === "MultiLineString") return g.coordinates as Ring[];
  return [];
}

async function comRecords(dataset: string, field: string, lat: number, lon: number, radius: number, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const url = `${COM}/${dataset}/records?${new URLSearchParams({ where: `within_distance(${field}, geom'POINT(${lon} ${lat})', ${Math.round(radius)}m)`, limit: "100", offset: String(offset) })}`;
    const res = await fetch(url, { signal, headers: { "User-Agent": AGENT } });
    if (!res.ok) throw new Error(`City of Melbourne data ${dataset}: HTTP ${res.status}`);
    const data = await res.json() as { results?: Record<string, unknown>[]; total_count?: number };
    out.push(...(data.results ?? []));
    if (!data.results?.length || out.length >= (data.total_count ?? 0)) break;
  }
  return out;
}

export async function fetchCityOfMelbourne(lat: number, lon: number, radius: number, signal?: AbortSignal): Promise<Reference> {
  const [buildings, footpaths, trees] = await Promise.all([
    comRecords("2023-building-footprints", "geo_point_2d", lat, lon, radius, signal),
    comRecords("footpaths", "geo_point_2d", lat, lon, radius + 100, signal),
    comRecords("trees-with-species-and-dimensions-urban-forest", "geolocation", lat, lon, radius, signal),
  ]);
  const shape = (r: Record<string, unknown>) => ringsOf((r.geo_shape as { geometry?: Geometry } | undefined)?.geometry);
  return {
    source: "City of Melbourne open data (2023 building footprints, footpaths, street trees)",
    buildings: buildings.flatMap(shape),
    footpaths: footpaths.flatMap(shape),
    trees: trees.flatMap(r => { const g = r.geolocation as { lon?: number; lat?: number } | undefined; return g && typeof g.lon === "number" && typeof g.lat === "number" ? [[g.lon, g.lat] as [number, number]] : []; }),
  };
}

export async function fetchOpenStreetMap(lat: number, lon: number, radius: number, signal?: AbortSignal): Promise<Reference> {
  const query = `[out:json][timeout:25];(way["building"](around:${Math.round(radius)},${lat},${lon});node["natural"="tree"](around:${Math.round(radius)},${lat},${lon}););out geom;`;
  const res = await fetch(OVERPASS, { method: "POST", body: new URLSearchParams({ data: query }), signal, headers: { "User-Agent": AGENT } });
  if (!res.ok) throw new Error(`OpenStreetMap Overpass: HTTP ${res.status}`);
  const data = await res.json() as { elements?: { type: string; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[] }[] };
  const buildings: Ring[] = [], trees: [number, number][] = [];
  for (const e of data.elements ?? []) {
    if (e.type === "way" && e.geometry) buildings.push(e.geometry.map(p => [p.lon, p.lat]));
    if (e.type === "node" && typeof e.lon === "number" && typeof e.lat === "number") trees.push([e.lon, e.lat]);
  }
  return { source: "OpenStreetMap (buildings, trees)", buildings, footpaths: [], trees };
}

// City of Melbourne data where it has buildings near the point, otherwise OpenStreetMap.
export async function fetchReference(lat: number, lon: number, radius = 120, signal?: AbortSignal): Promise<Reference> {
  let com: Reference | null = null;
  try { com = await fetchCityOfMelbourne(lat, lon, radius, signal); } catch { com = null; }
  if (com && com.buildings.length >= 2) return com;
  return fetchOpenStreetMap(lat, lon, radius, signal);
}
