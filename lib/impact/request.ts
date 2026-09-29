// Turns Claude's TGS analysis into an ImpactRequest: the plan's facts plus the
// nearest traffic signal site and its daily count. Server only (reads the site table).

import tables from "@/data/impact/mvm-tables.json";
import type { TgsAnalysis } from "@/lib/tgs-analysis";
import type { ImpactRequest } from "./types";

const sites = (tables as unknown as { sites: [number, string, number | null, number | null, number][] }).sites;

// Streets with trams, CBD and inner Melbourne only. Hand-entered from the Yarra
// Trams network map, so it is partial. A GTFS lookup should replace it.
const TRAM_STREETS = [
  "SWANSTON", "ELIZABETH", "WILLIAM", "SPENCER", "LATROBE", "COLLINS", "BOURKE", "FLINDERS", "SPRING",
  "NICHOLSON", "KILDA", "BRUNSWICK", "LYGON", "SYDNEY", "CHAPEL", "GLENFERRIE", "TOORAK", "VICTORIA",
  "BRIDGE", "SWAN", "CHURCH", "RACECOURSE", "MOUNTALEXANDER", "FLEMINGTON", "ROYAL", "CLARENDON", "PEEL",
  "MACAULAY", "HARBOUR", "QUEENS", "HIGH", "DANDENONG", "MALVERN", "WATTLETREE",
];

// "Little La Trobe Street" -> "LITTLELATROBE", to match SCATS names like "SWANSTON/LATROBE".
function norm(name: string) {
  return name.toUpperCase().replace(/\b(STREET|ST|ROAD|RD|AVENUE|AVE|PARADE|PDE|HIGHWAY|HWY|DRIVE|DR|LANE|LN|PLACE|PL|BOULEVARD|BVD|BLVD)\b\.?/g, "").replace(/[^A-Z]/g, "");
}

// A signal site whose name has both the works street and a cross street from the extent.
function findSite(street: string, extent: string) {
  const main = norm(street);
  if (!main) return null;
  const cross = extent.split(/\b(?:between|and|to|from|at|near)\b|[,&/]/i).map(norm).filter(c => c && c !== main);
  for (const c of cross) {
    const hit = sites.find(([, name]) => { const parts = name.split("/").map(norm); return parts.includes(main) && parts.includes(c); });
    if (hit) return hit;
  }
  return null;
}

// Reads "7am", "10 pm", "07:00" or "2200" as an hour of the day.
function parseHour(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  return h >= 0 && h <= 24 ? h : null;
}

export function parseWorkHours(analysis: Pick<TgsAnalysis, "work_hours"> & Partial<Pick<TgsAnalysis, "work_days" | "work_start" | "work_end">>): ImpactRequest["work_hours"] {
  const text = analysis.work_hours;
  let start = analysis.work_start ? parseHour(analysis.work_start) : null;
  let end = analysis.work_end ? parseHour(analysis.work_end) : null;
  if (start === null || end === null) {
    const times = text.match(/\b\d{1,2}(?::?\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\b[0-2]\d[0-5]\d\b/gi) ?? [];
    const [first, second] = times;
    if (first && second) { start = parseHour(first); end = parseHour(second); }
  }
  const days = analysis.work_days || (text.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b(?:\s*(?:to|-|–)\s*\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?/i)?.[0] ?? "");
  return { text, days, start_hour: start, end_hour: end === 0 ? 24 : end };
}

export function buildImpactRequest(analysis: TgsAnalysis): ImpactRequest {
  const site = findSite(analysis.site.street, analysis.site.extent);
  const main = norm(analysis.site.street);
  const closed = analysis.closure_type === "road closed";
  return {
    site: {
      street: analysis.site.street,
      extent: analysis.site.extent,
      area: analysis.site.area,
      lat: site?.[2] ?? null,
      lon: site?.[3] ?? null,
      scats_site_no: site?.[0] ?? null,
      scats_site_name: site?.[1] ?? null,
      daily_volume: site?.[4] ?? null,
      tram_route: TRAM_STREETS.includes(main),
    },
    closure_type: analysis.closure_type,
    work_hours: parseWorkHours(analysis),
    lanes_per_direction: analysis.lanes_per_direction,
    lanes_open: closed ? 0 : analysis.lanes_open,
    detour: analysis.detour,
    pedestrian_management: analysis.pedestrian_management,
  };
}
