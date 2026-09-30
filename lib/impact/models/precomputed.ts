// Plug-in: results made offline and saved as ImpactResult JSON in data/impact/.
// Each file only covers the site it was made for. To add one, save the JSON in
// data/impact/, import it here and add an entry with the sites it covers.
// An entry marked `preferred` is used for its site even when IMPACT_MODEL is not
// set, in place of the live lookup model (lib/impact/index.ts).

import sumoSwanston from "@/data/impact/sumo-swanston.json";
import sumoSmac from "@/data/impact/sumo-smac.json";
import type { ImpactModel, ImpactRequest, ImpactResult } from "../types";

type Precomputed = { id: string; method: string; result: ImpactResult; covers: (req: ImpactRequest) => boolean; preferred?: boolean };

export const PRECOMPUTED: Precomputed[] = [
  {
    // model/sumo/, copied from model/sumo/output/swanston.json. Swanston St closed, La Trobe to Little La Trobe.
    id: "sumo",
    method: "SUMO traffic simulation",
    result: sumoSwanston as ImpactResult,
    covers: req => req.closure_type === "road closed" && (req.site.scats_site_no === 2921 || /swanston/i.test(req.site.street) && /la\s?trobe/i.test(req.site.extent)),
  },
  {
    // model/sumo/ with SUMO_SITE=smac, copied from model/sumo/output/smac/impact.json. The test TGS in data/test/:
    // Swanston St southbound closed between Faraday St and Grattan St. Signal sites 4391 and 4392 are its two ends.
    id: "sumo",
    method: "SUMO traffic simulation",
    result: sumoSmac as ImpactResult,
    covers: req => /swanston/i.test(req.site.street) && (req.closure_type === "lanes closed" || req.closure_type === "road closed")
      && (req.site.scats_site_no === 4391 || req.site.scats_site_no === 4392 || /grattan|faraday|sidney myer/i.test(`${req.site.extent} ${req.site.area}`)),
    preferred: true,
  },
];

export class NotCoveredError extends Error {}

// The model to use for a site when IMPACT_MODEL is not set, if a saved result is preferred there.
export function preferredModel(req: ImpactRequest): string | null {
  return PRECOMPUTED.find(p => p.preferred && p.covers(req))?.id ?? null;
}

export function precomputedModel(id: string): ImpactModel | null {
  const entries = PRECOMPUTED.filter(p => p.id === id);
  if (!entries.length) return null;
  return {
    id,
    method: entries[0].method,
    async estimate(req) {
      const entry = entries.find(p => p.covers(req));
      if (!entry) throw new NotCoveredError(`The ${entries[0].method} result was made for another site.`);
      return { ...entry.result, provenance: "precomputed" };
    },
  };
}
