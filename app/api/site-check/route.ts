import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getVercelOidcToken } from "@vercel/oidc";
import { siteCheckSchema, type ScanPointResult, type SiteCheck } from "@/lib/site-check";
import type { TgsAnalysis } from "@/lib/tgs-analysis";

// Claude compares the TGS analysis with the scan measurements. The browser
// measures the scans, so only small JSON comes here.
export const maxDuration = 120;

async function gatewayClient() {
  return new Anthropic({
    apiKey: process.env.AI_GATEWAY_API_KEY || await getVercelOidcToken(),
    baseURL: "https://ai-gateway.vercel.sh",
  });
}

// Same model as the TGS analysis.
const MODEL = "anthropic/claude-sonnet-5.5";

function systemPrompt() {
  const text = readFileSync(join(process.cwd(), "prompts", "site-check.md"), "utf8");
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { analysis?: TgsAnalysis; scans?: ScanPointResult[] } | null;
  if (!body?.analysis || !Array.isArray(body.scans)) return fail("The plan or the scans are missing.", 400);
  const input = JSON.stringify({ tgs_analysis: body.analysis, scan_points: body.scans });
  if (input.length > 200_000) return fail("Too much scan data to check at once.", 413);

  try {
    const client = await gatewayClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(),
      output_config: { effort: "medium", format: { type: "json_schema", schema: siteCheckSchema } },
      messages: [{ role: "user", content: `Check this plan against the street.\n\n${input}` }],
    });
    if (response.stop_reason === "refusal") return fail("The check was declined. Try again.", 422);
    if (response.stop_reason === "max_tokens") return fail("The check was cut short. Try again.", 502);
    const text = response.content.find(block => block.type === "text");
    if (!text || text.type !== "text") return fail("The check came back empty. Try again.", 502);
    const check: SiteCheck = JSON.parse(text.text);
    return Response.json({ check });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("AI Gateway authentication failed. Run `vercel env pull .env.local` to refresh the OIDC token.", error.message);
      return fail("The check service isn't connected. Check the AI Gateway setup.", 500);
    }
    if (error instanceof Anthropic.RateLimitError) return fail("Too many checks at once. Wait a moment and try again.", 429);
    if (error instanceof Anthropic.APIError) {
      console.error(`AI Gateway error ${error.status}:`, error.message);
      return fail("The check failed. Try again.", 502);
    }
    console.error("Site check failed:", error);
    return fail("The check failed. Try again.", 500);
  }
}
