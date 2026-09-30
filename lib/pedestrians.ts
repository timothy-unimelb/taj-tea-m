// Pedestrian counts near the site, from the City of Melbourne Pedestrian
// Counting System (open data, hourly counts). Runs on the server for the site
// check, so Claude can apply the council's crowding rule (prompts/site-check.md).

const API = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets";

export type PedestrianCounts = {
  source: string;
  sensors: {
    name: string;
    distance_m: number;
    weekdays: number;                  // weekdays averaged
    hourly: number[];                  // typical weekday count for each hour, 0 to 23
    works_hours_peak: { hour: number; people_per_hour: number; people_per_minute: number } | null;
  }[];
};

const distance = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110574, dx = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
};

// Typical weekday hourly counts for the two sensors nearest the site, over the last 8 weeks.
export async function pedestrianCountsNear(site: { lat: number; lon: number }, workStart = "", workEnd = ""): Promise<PedestrianCounts | null> {
  const near = `within_distance(location, geom'POINT(${site.lon} ${site.lat})', 400m)`;
  const found = await fetch(`${API}/pedestrian-counting-system-sensor-locations/records?where=${encodeURIComponent(near)}&limit=20`, { signal: AbortSignal.timeout(8000) });
  if (!found.ok) return null;
  const sensors = ((await found.json()).results ?? []) as { location_id: number; sensor_description: string; status: string; latitude: number; longitude: number }[];
  const nearest = sensors.filter(s => s.status === "A")
    .map(s => ({ ...s, d: distance(site, { lat: s.latitude, lon: s.longitude }) }))
    .sort((a, b) => a.d - b.d).slice(0, 2);
  if (!nearest.length) return null;

  const since = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
  const where = `location_id in (${nearest.map(s => s.location_id).join(",")}) and sensing_date >= date'${since}'`;
  const rows = await fetch(`${API}/pedestrian-counting-system-monthly-counts-per-hour/exports/json?where=${encodeURIComponent(where)}&select=location_id,sensing_date,hourday,pedestriancount`, { signal: AbortSignal.timeout(15000) });
  if (!rows.ok) return null;
  const data = await rows.json() as { location_id: number; sensing_date: string; hourday: number; pedestriancount: number }[];

  const [h0, h1] = [parseInt(workStart) || 0, workEnd ? Math.ceil(parseFloat(workEnd.replace(":", "."))) : 24];
  return {
    source: "City of Melbourne Pedestrian Counting System, typical weekday over the last 8 weeks",
    sensors: nearest.map(s => {
      const sums = Array(24).fill(0), days = Array(24).fill(0);
      for (const r of data) {
        const weekday = new Date(`${r.sensing_date}T12:00:00`).getDay();
        if (r.location_id !== s.location_id || weekday === 0 || weekday === 6) continue;
        sums[r.hourday] += r.pedestriancount; days[r.hourday]++;
      }
      const hourly = sums.map((t, h) => days[h] ? Math.round(t / days[h]) : 0);
      let peak: PedestrianCounts["sensors"][number]["works_hours_peak"] = null;
      for (let h = h0; h < Math.min(24, h1); h++) if (!peak || hourly[h] > peak.people_per_hour) peak = { hour: h, people_per_hour: hourly[h], people_per_minute: Math.round(hourly[h] / 6) / 10 };
      return { name: s.sensor_description, distance_m: Math.round(s.d), weekdays: Math.max(...days), hourly, works_hours_peak: peak };
    }),
  };
}
