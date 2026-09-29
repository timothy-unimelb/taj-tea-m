// The model switch. IMPACT_MODEL picks which model the report uses:
//   mvm      Tamara's past-closures lookup and queue, live (default)
//   sumo     SUMO simulation, precomputed for the Swanston St sample only
//   http     any service at IMPACT_MODEL_URL that returns an ImpactResult
// If the chosen model can't cover the site, or fails, the live lookup model is
// used instead and the report says so in its assumptions.

import type { ImpactRequest, ImpactResult, ImpactModel } from "./types";
import { mvmModel } from "./models/mvm";
import { httpModel } from "./models/http";
import { precomputedModel } from "./models/precomputed";
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
    const reason = error instanceof Error ? error.message : "It failed.";
    result = { ...fallback, assumptions: [`The ${id} model was not used: ${reason} The live lookup model was used instead.`, ...fallback.assumptions] };
  }
  return rateSeverity(result, request);
}

export type { ImpactRequest, ImpactResult } from "./types";
