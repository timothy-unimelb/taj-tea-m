import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { getVercelOidcToken } from "@vercel/oidc";
import { tgsAnalysisSchema, type TgsAnalysis } from "@/lib/tgs-analysis";

// Claude can take a minute to read a detailed drawing.
export const maxDuration = 120;

// Claude runs through Vercel AI Gateway. The project's OIDC token authenticates.
// On Vercel it arrives with each request; locally it comes from .env.local.
async function gatewayClient() {
  return new Anthropic({
    apiKey: process.env.AI_GATEWAY_API_KEY || await getVercelOidcToken(),
    baseURL: "https://ai-gateway.vercel.sh",
  });
}

// Sonnet 5.5 keeps costs down for a student budget.
const MODEL = "anthropic/claude-sonnet-5.5";
const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

// The system prompt lives in prompts/tgs-analysis.md so anyone can refine it.
// The notes comment at the top of that file is stripped before sending.
// next.config.ts ships the file with this route on Vercel.
function systemPrompt() {
  const text = readFileSync(join(process.cwd(), "prompts", "tgs-analysis.md"), "utf8");
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

type Upload =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: (typeof IMAGE_TYPES)[number]; data: string } };

function toContentBlock(file: File, data: string): Upload | null {
  if (file.type === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  const imageType = IMAGE_TYPES.find(t => t === file.type);
  return imageType ? { type: "image", source: { type: "base64", media_type: imageType, data } } : null;
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("No TGS file was uploaded.", 400);
  if (file.size > MAX_BYTES) return fail("This file is larger than 20 MB. Choose a smaller file.", 413);

  const upload = toContentBlock(file, Buffer.from(await file.arrayBuffer()).toString("base64"));
  if (!upload) return fail("Choose a PDF, PNG or JPG file.", 415);

  try {
    const client = await gatewayClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(),
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: tgsAnalysisSchema },
      },
      messages: [{
        role: "user",
        content: [upload, { type: "text", text: `Analyse this traffic guidance scheme (${file.name}).` }],
      }],
    });

    if (response.stop_reason === "refusal") return fail("The analysis was declined for this file. Try a different TGS.", 422);
    if (response.stop_reason === "max_tokens") return fail("The analysis was cut short. Try again.", 502);

    const text = response.content.find(block => block.type === "text");
    if (!text || text.type !== "text") return fail("The analysis came back empty. Try again.", 502);
    const analysis: TgsAnalysis = JSON.parse(text.text);
    return Response.json({ analysis });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("AI Gateway authentication failed. Run `vercel env pull .env.local` to refresh the OIDC token.", error.message);
      return fail("The analysis service isn't connected. Check the AI Gateway setup.", 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("AI Gateway rate limit:", error.message);
      return fail("Too many analyses at once. Wait a moment and try again.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`AI Gateway error ${error.status}:`, error.message);
      return fail("The analysis failed. Try again.", 502);
    }
    console.error("TGS analysis failed:", error);
    return fail("The analysis failed. Try again.", 500);
  }
}
