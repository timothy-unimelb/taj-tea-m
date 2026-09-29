// Plug-in: results made offline and saved as ImpactResult JSON in data/impact/.
// Each file only covers the site it was made for. To add one, save the JSON in
// data/impact/, import it here and add an entry with the sites it covers.

import type { ImpactModel, ImpactRequest, ImpactResult } from "../types";

type Precomputed = { id: string; method: string; result: ImpactResult; covers: (req: ImpactRequest) => boolean };

export const PRECOMPUTED: Precomputed[] = [];

export class NotCoveredError extends Error {}

export function precomputedModel(id: string): ImpactModel | null {
  const entry = PRECOMPUTED.find(p => p.id === id);
  if (!entry) return null;
  return {
    id: entry.id,
    method: entry.method,
    async estimate(req) {
      if (!entry.covers(req)) throw new NotCoveredError(`The ${entry.method} result was made for another site.`);
      return { ...entry.result, provenance: "precomputed" };
    },
  };
}
