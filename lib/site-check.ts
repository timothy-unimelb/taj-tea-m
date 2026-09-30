// Shape of Claude's plan vs street check (app/api/site-check). Claude reads the
// TGS analysis and the scan measurements and writes the safety finding and the
// recommended actions. Every number it quotes must come from the measurements.

import type { ScanMeasurement } from "@/lib/scan/measure";

export type ScanPointResult = { name: string; location: string; capture: string; measurement: ScanMeasurement | null };

const action = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: ["traffic", "pedestrians", "transport", "safety"] },
    title: { type: "string", description: "Imperative, under 8 words, e.g. 'Move the bin at the SMAC entry'" },
    summary: { type: "string", description: "One sentence: what is wrong and where" },
    impact: { type: "string", description: "What happens on site if nothing changes" },
    why: { type: "string", description: "Why it matters for people using the street" },
    recommendation: { type: "string", description: "What to change, using equipment from the plan where possible (barriers, signs, VMS boards)" },
  },
  required: ["category", "title", "summary", "impact", "why", "recommendation"],
} as const;

export const siteCheckSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", description: "One or two sentences: what must be reviewed before deployment" },
    safety_severity: { type: "string", enum: ["Low", "Moderate", "High"] },
    safety_summary: { type: "string", description: "One or two sentences naming the main conflicts between plan and street" },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          scan_point: { type: "string" },
          measured: { type: "string", description: "The measured value, copied from the measurements, e.g. 'footpath 1.4 m clear at 10.5 m'" },
          needed: { type: "string", description: "What the plan or the rules need there, e.g. '2.0 m (plan note)'" },
          finding: { type: "string" },
        },
        required: ["scan_point", "measured", "needed", "finding"],
      },
    },
    actions: { type: "array", description: "2 to 4 actions, most important first", items: action },
  },
  required: ["decision", "safety_severity", "safety_summary", "conflicts", "actions"],
} as const;

export type SiteAction = { category: "traffic" | "pedestrians" | "transport" | "safety"; title: string; summary: string; impact: string; why: string; recommendation: string };
export type SiteCheck = {
  decision: string;
  safety_severity: "Low" | "Moderate" | "High";
  safety_summary: string;
  conflicts: { scan_point: string; measured: string; needed: string; finding: string }[];
  actions: SiteAction[];
};

// Used when Claude can't be reached: plain rules on the measured numbers, so the
// report still shows what the scans found. Guide widths as in prompts/site-check.md.
const FOOTPATH_MIN = 1.5, FOOTPATH_ABS_MIN = 1.2;
export function ruleCheck(scans: ScanPointResult[]): SiteCheck {
  const conflicts: SiteCheck["conflicts"] = [];
  const actions: SiteAction[] = [];
  for (const s of scans) {
    const f = s.measurement?.footpath;
    if (!f || f.min_clear_m >= FOOTPATH_MIN) continue;
    const blocker = s.measurement!.obstacles.find(o => Math.abs(o.along_m - f.narrowest_at_m) <= 1.5);
    conflicts.push({
      scan_point: s.name,
      measured: `footpath ${f.min_clear_m} m clear at ${f.narrowest_at_m} m along the scan`,
      needed: `${FOOTPATH_MIN} m (Austroads guide minimum past works)`,
      finding: blocker ? `An obstacle ${blocker.height_m} m high, ${blocker.from_kerb_m} m from the kerb, narrows the path.` : "The path narrows below the guide minimum.",
    });
    actions.push({
      category: "pedestrians",
      title: `Widen the footpath at ${s.name}`,
      summary: `The footpath is ${f.min_clear_m} m clear at its narrowest, below ${FOOTPATH_MIN} m.`,
      impact: "People with prams, wheelchairs or mobility aids may not get past, and may step onto the road.",
      why: "Pedestrians are sent along this path while the works are in place.",
      recommendation: "Move the obstacle before setup, or move the barrier line to keep 1.5 m clear.",
    });
  }
  const worst = Math.min(...scans.map(s => s.measurement?.footpath?.min_clear_m ?? Infinity));
  // Widths the scan couldn't measure are not a pass.
  if (scans.every(s => !s.measurement?.footpath)) {
    return {
      decision: "The scan found the kerb but couldn't measure footpath widths reliably. Check the clear widths on site before deployment. Checked with measurement rules because the AI check was unavailable.",
      safety_severity: "Moderate",
      safety_summary: "Footpath and lane widths are not confirmed by the scan.",
      conflicts: [],
      actions: [{ category: "pedestrians", title: "Measure the footpath on site", summary: "The scan couldn't confirm the clear footpath width past the works.", impact: "A narrow spot may only show up after setup.", why: "Pedestrians are sent along this path while the works are in place.", recommendation: "Tape-measure the narrowest point before setup, and keep at least 1.5 m clear." }],
    };
  }
  const severity = worst < FOOTPATH_ABS_MIN ? "High" : conflicts.length ? "Moderate" : "Low";
  return {
    decision: conflicts.length ? `Fix the narrow footpath at ${conflicts.map(c => c.scan_point).join(", ")} before deployment. Checked with measurement rules because the AI check was unavailable.` : "The measured widths fit. Checked with measurement rules because the AI check was unavailable.",
    safety_severity: severity,
    safety_summary: conflicts.length ? `${conflicts.length} scan point${conflicts.length > 1 ? "s have" : " has"} a footpath narrower than ${FOOTPATH_MIN} m.` : "No measured width is below the guide minimums.",
    conflicts,
    actions,
  };
}
