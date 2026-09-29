// The one place the app gets data from.
// Screens import from here, never from data/mock/ directly.
// To switch to real data, change this file only.

import demo from "@/data/mock/barrier-brain.json";
import savedDemoAnalysis from "@/data/mock/tgs/swanston-analysis.json";
import sampleTgs from "@/data/mock/tgs/swanston-st-closure.webp";
import type { TgsAnalysis } from "@/lib/tgs-analysis";
import type { ImpactResult, ModeImpact, Range, Severity } from "@/lib/impact/types";

export const sampleTgsUrl = sampleTgs.src;

// A saved Claude analysis of the demo TGS, so rehearsals are instant and free.
export const demoAnalysis = savedDemoAnalysis.analysis as TgsAnalysis;

// Claude reads an uploaded TGS for real. The demo TGS uses the saved analysis.
export async function analyseTgs(file: File | undefined, signal?: AbortSignal): Promise<TgsAnalysis> {
  if (!file) return demoAnalysis;
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/analyse-tgs", { method: "POST", body, signal });
  const result = await response.json().catch(() => ({ error: "The analysis failed. Try again." }));
  if (!response.ok) throw new Error(result.error);
  return result.analysis;
}

// Runs the chosen impact model on the server (see lib/impact/index.ts).
export async function estimateImpact(analysis: TgsAnalysis | null, signal?: AbortSignal): Promise<ImpactResult> {
  const response = await fetch("/api/impact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis: analysis ?? demoAnalysis }),
    signal,
  });
  const result = await response.json().catch(() => ({ error: "The impact estimate failed. Try again." }));
  if (!response.ok) throw new Error(result.error);
  return result.result;
}

// Projects, the scan check and the safety findings are still fixed demo data.
export function getAssessmentData() {
  return demo;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-AU");
const span = (r: Range) => r.low === r.high ? `${fmt(r.typical)} ${r.unit}` : `${fmt(r.low)} to ${fmt(r.high)} ${r.unit}, typically ${fmt(r.typical)}`;

function details(mode: ModeImpact) {
  if (mode.status !== "modelled") return [];
  const lines = [
    mode.forced_diversions && `Forced diversions: ${span(mode.forced_diversions)}`,
    mode.max_queue && `Longest queue: ${span(mode.max_queue)}`,
    mode.delay && (mode.delay.low < 0 ? `Delay: no clear change (${fmt(mode.delay.low)} to ${fmt(mode.delay.high)} ${mode.delay.unit} across runs)` : `Delay: ${span(mode.delay)}`),
    mode.detour && `Extra distance per diverted trip: ${span(mode.detour)}`,
    ...(mode.other ?? []).map(o => `${o.label}: ${span(o.range)}`),
  ];
  return lines.filter((line): line is string => Boolean(line));
}

// A modelled mode shows the model's sentence. One the model doesn't cover says why it still matters.
function describe(mode: ModeImpact) {
  if (mode.status === "modelled") return mode.summary;
  return mode.severity === "Review required" ? `${mode.severity_reason} ${mode.summary}` : mode.summary;
}

const PROVENANCE = { live: "Calculated for this plan", precomputed: "Calculated in advance for this site", fixture: "Fixed demo values" };

// Everything the report shows from the impact model. The report reads only this.
export function buildReport(impact: ImpactResult) {
  const { cars, trucks, pedestrians, public_transport: transport } = impact.modes;
  const safety = demo.safety;
  const traffic = trucks.status === "modelled" ? [...details(cars), ...details(trucks).map(line => `Trucks. ${line}`)] : details(cars);
  const impactSummary = [
    { id: "traffic", label: "Traffic", severity: cars.severity!, description: describe(cars), reason: cars.severity_reason!, details: traffic },
    { id: "pedestrians", label: "Pedestrian access", severity: pedestrians.severity!, description: describe(pedestrians), reason: pedestrians.severity_reason!, details: details(pedestrians) },
    { id: "transport", label: "Public transport", severity: transport.severity!, description: describe(transport), reason: transport.severity_reason!, details: details(transport) },
    { id: "safety", label: "Site safety", severity: safety.severity as Severity, description: safety.description, reason: safety.basis, details: [] },
  ];
  const window = impact.recommended_window;
  const trafficAction = window && !window.window.startsWith("Planned hours") ? {
    id: 0, category: "traffic", title: "Compare a different work window",
    summary: `${window.window}. ${window.reason}`,
    impact: describe(cars),
    why: "Fewer drivers meet the closure when traffic is light, so fewer are diverted or delayed.",
    recommendation: `Compare the planned hours with this window (${window.window.toLowerCase()}), and check the work fits.`,
  } : null;
  const actions = [...demo.explanations.actions, ...(trafficAction ? [trafficAction] : [])].map((action, i) => ({ ...action, id: i + 1 }));
  return {
    period: impact.period,
    overall: impact.overall!.severity,
    overallReason: impact.overall!.reason,
    impactSummary,
    keyFindings: [describe(cars), describe(pedestrians), describe(transport), safety.description],
    actions,
    sourceNote: `Based on the uploaded TGS and the site scan. Traffic estimate: ${impact.method}${impact.label ? ` (${impact.label.toLowerCase()})` : ""}.`,
    sources: ["TGS analysis", "Site scan", `${impact.method}${impact.label ? `, ${impact.label.toLowerCase()}` : ""}`],
    method: {
      name: impact.method,
      label: impact.label,
      provenance: PROVENANCE[impact.provenance],
      confidence: `${impact.confidence.charAt(0).toUpperCase()}${impact.confidence.slice(1)}. ${impact.confidence_note}`,
      window: window ? `${window.window}. ${window.reason}` : null,
      assumptions: impact.assumptions,
    },
  };
}

export type AssessmentData = ReturnType<typeof getAssessmentData>;
export type Project = AssessmentData["projects"][number];
export type ReportView = ReturnType<typeof buildReport>;
export type ImpactMetric = ReportView["impactSummary"][number];
