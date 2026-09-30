// Map data around a point for placing a site scan: building outlines,
// footpath outlines and street trees. GET ?lat=-37.799&lon=144.964&radius=120
// Council open data where it covers the site, otherwise OpenStreetMap.

import { fetchReference } from "@/lib/scan/reference";

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  const radius = Math.min(400, Math.max(30, Number(url.searchParams.get("radius")) || 120));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return Response.json({ error: "Give lat and lon." }, { status: 400 });
  try {
    const reference = await fetchReference(lat, lon, radius, AbortSignal.timeout(25000));
    return Response.json(reference, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    return Response.json({ error: `Map data could not be fetched: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
