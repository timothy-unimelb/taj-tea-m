import { buildImpactRequest } from "@/lib/impact/request";
import { estimateImpact } from "@/lib/impact";
import type { TgsAnalysis } from "@/lib/tgs-analysis";

// Takes Claude's TGS analysis, finds the site's traffic data, and runs the
// chosen impact model. Returns the request it built and the model's result.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { analysis?: TgsAnalysis } | null;
  const analysis = body?.analysis;
  if (!analysis?.site || !analysis.closure_type) return Response.json({ error: "No TGS analysis was sent." }, { status: 400 });
  try {
    const impactRequest = buildImpactRequest(analysis);
    const result = await estimateImpact(impactRequest);
    return Response.json({ request: impactRequest, result });
  } catch (error) {
    console.error("Impact estimate failed:", error);
    return Response.json({ error: "The impact estimate failed. Try again." }, { status: 500 });
  }
}
