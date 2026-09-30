// The model switch. IMPACT_MODEL picks which model the report uses:
//   mvm      Tamara's past-closures lookup and queue, live, any site (default)
//   sumo     SUMO simulation, precomputed for the Swanston St sample only
//   http     any service at IMPACT_MODEL_URL that returns an ImpactResult
// If the chosen model can't cover the site, or fails, the live lookup model is
// used instead and the report says so in its assumptions. With IMPACT_MODEL=sumo
// the Swanston sample gets SUMO and every other site gets the lookup model.
// The lookup is the default again so every TGS runs the live model (Tim, 30 Sep).

import type { ImpactRequest, ImpactResult, ImpactModel } from "./types";
import { mvmModel } from "./models/mvm";
import { httpModel } from "./models/http";
import { NotCoveredError, precomputedModel } from "./models/precomputed";
import { rateSeverity } from "./severity";

export const DEFAULT_MODEL = "mvm";

function chooseModel(id: string): ImpactModel {
  if (id === "mvm") return mvmModel;
  if (id === "http") {
    const url = process.env.IMPACT_MODEL_URL;
    if (!url) throw new Error("IMPACT_MODEL=http needs IMPACT_MODEL_URL");
    return httpModel(url);
  }
  const saved = precomputedModel(id);
  if (saved) return saved;
  throw new Error(`Unknown impact model "${id}"`);
}

export async function estimateImpact(request: ImpactRequest, id = process.env.IMPACT_MODEL || DEFAULT_MODEL): Promise<ImpactResult> {
  let result: ImpactResult;
  try {
    result = await chooseModel(id).estimate(request);
  } catch (error) {
    if (id === mvmModel.id) throw error;
    console.warn(`Impact model "${id}" not used:`, error instanceof Error ? error.message : error);
    const fallback = await mvmModel.estimate(request);
    const note = error instanceof NotCoveredError
      ? `No ${id.toUpperCase()} result exists for this site yet, so the live lookup model was used.`
      : `The ${id} model failed (${error instanceof Error ? error.message : "unknown error"}), so the live lookup model was used.`;
    result = { ...fallback, assumptions: [note, ...fallback.assumptions] };
  }
  return rateSeverity(result, request);
}

export type { ImpactRequest, ImpactResult } from "./types";
