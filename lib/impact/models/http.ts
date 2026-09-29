// Plug-in: any outside service that takes an ImpactRequest as JSON (POST) and
// answers with an ImpactResult. Set IMPACT_MODEL=http and IMPACT_MODEL_URL.

import type { ImpactModel, ImpactResult } from "../types";

export function httpModel(url: string): ImpactModel {
  return {
    id: "http",
    method: "External impact model",
    async estimate(req) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Impact service answered ${response.status}`);
      const result = await response.json() as ImpactResult;
      if (!result?.modes?.cars || !result.method) throw new Error("Impact service did not return an ImpactResult");
      return result;
    },
  };
}
