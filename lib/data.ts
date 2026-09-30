// The one place the app gets data from.
// Screens import from here, never from data/mock/ directly.
// To switch to real data, change this file only.

import demo from "@/data/mock/barrier-brain.json";
import laTrobeAnalysis from "@/data/mock/tgs/swanston-analysis.json";
import laTrobeTgs from "@/data/mock/tgs/swanston-st-closure.webp";
import smacAnalysis from "@/data/mock/tgs/swanston-smac-analysis.json";
import smacTgs from "@/data/test/swanston-smac-lane-closure.jpg";
import smacReport from "@/data/mock/reports/swanston-smac-report.json";
import type { TgsAnalysis } from "@/lib/tgs-analysis";
import type { ImpactResult, ModeId, ModeImpact, Range, Severity } from "@/lib/impact/types";
import type { ScanPointResult, SiteCheck } from "@/lib/site-check";

// Report points written in advance for a demo TGS, so its report needs no Claude call.
// Each point's checks answer the questions the report must cover (PITCH_CHECKLIST.md).
// `answer` is the short result that stands out, `text` one short line behind it,
// `status` its colour: ok, watch or fix. Site safety checks are actions, and their
// `answer` names the report point they come from.
type Check = { label: string; text: string; answer?: string; status?: "ok" | "watch" | "fix" };
export type SavedReport = {
  points: Record<"traffic" | "pedestrians" | "transport" | "safety", { summary?: string; reason?: string; checks: Check[] }>;
  site_check: SiteCheck;
  sources: string[];
};

// The demo TGS files, each with a saved Claude analysis so rehearsals are instant and free.
// The first is the one "Use demo TGS" loads. A project can name another in data/mock.
const DEMO_TGS = [
  { fileName: "swanston-smac-lane-closure.jpg", size: "0.9 MB", url: smacTgs.src, analysis: smacAnalysis.analysis as TgsAnalysis, report: smacReport as SavedReport },
  { fileName: "swanston-st-closure.webp", size: "0.4 MB", url: laTrobeTgs.src, analysis: laTrobeAnalysis.analysis as TgsAnalysis, report: null },
];
const demoTgsNamed = (fileName?: string) => DEMO_TGS.find(t => t.fileName === fileName) ?? DEMO_TGS[0];
export const demoTgsFile = (fileName?: string) => ({ name: demoTgsNamed(fileName).fileName, size: demoTgsNamed(fileName).size });
export const demoTgsUrl = (fileName?: string) => demoTgsNamed(fileName).url;
export const demoAnalysis = DEMO_TGS[0].analysis;

// The saved report points for an analysis, if it is a demo TGS's saved analysis.
export function savedReportFor(analysis: TgsAnalysis | null): SavedReport | null {
  return DEMO_TGS.find(t => t.analysis === (analysis ?? demoAnalysis))?.report ?? null;
}

// Claude reads an uploaded TGS for real. A demo TGS uses its saved analysis.
export async function analyseTgs(tgs: { name: string; file?: File } | null, signal?: AbortSignal): Promise<TgsAnalysis> {
  const file = tgs?.file;
  if (!file) return demoTgsNamed(tgs?.name).analysis;
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

// Claude compares the plan with the measured scans (app/api/site-check).
export async function checkSite(analysis: TgsAnalysis, scans: ScanPointResult[], signal?: AbortSignal): Promise<SiteCheck> {
  const response = await fetch("/api/site-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis, scans }),
    signal,
  });
  const result = await response.json().catch(() => ({ error: "The site check failed. Try again." }));
  if (!response.ok) throw new Error(result.error);
  return result.check;
}

// Projects and the demo scan's findings are fixed demo data.
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
// Recommendations match the report: each one belongs to a point in the impact
// summary (traffic, pedestrian access, public transport, site safety). The most
// severe points come first, each point gets one before any gets a second, and
// there are at most MAX_RECOMMENDATIONS.
const MAX_RECOMMENDATIONS = 5;
const SEVERITY_ORDER = ["High", "Moderate", "Review required", "Low", "Not modelled"];
type Action = { category: string; title: string; summary: string; impact: string; why: string; recommendation: string };
function pickRecommendations(candidates: Action[], points: { id: string; label: string; severity: string }[]) {
  const rank = (a: Action) => {
    const point = points.find(p => p.id === a.category);
    return point ? SEVERITY_ORDER.indexOf(point.severity) : SEVERITY_ORDER.length;
  };
  const unique = candidates.filter((a, i) => candidates.findIndex(b => b.title === a.title) === i && points.some(p => p.id === a.category));
  const ordered = unique.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(x => x.a);
  const first = ordered.filter((a, i) => ordered.findIndex(b => b.category === a.category) === i);
  const rest = ordered.filter(a => !first.includes(a));
  return [...first, ...rest].slice(0, MAX_RECOMMENDATIONS).map((action, i) => ({ ...action, id: i + 1, point: points.find(p => p.id === action.category)!.label }));
}

// Which report point a mode's findings belong to.
const POINT: Record<ModeId, string> = { cars: "traffic", trucks: "traffic", pedestrians: "pedestrians", public_transport: "transport" };

// `check` is Claude's plan vs street check of real scans. Without it the demo findings show.
// The impact model's own findings (gaps in the plan, lib/impact/types.ts) show under their
// report point, in the key findings and as recommendations, ahead of the site check's.
// `saved` is a demo TGS's report points, written in advance. With it, each point shows its
// checks, and its site check stands in for Claude's.
export function buildReport(impact: ImpactResult, check: SiteCheck | null = null, scansMeasured = 0, saved: SavedReport | null = null) {
  const { cars, trucks, pedestrians, public_transport: transport } = impact.modes;
  const findings = impact.findings ?? [];
  const gaps = (point: string) => findings.filter(f => POINT[f.mode] === point).map(f => `Plan gap: ${f.summary}`);
  const findingActions: Action[] = findings.map(f => ({ category: POINT[f.mode], title: f.title, summary: f.summary, impact: f.impact, why: f.why, recommendation: f.recommendation }));
  check = check ?? saved?.site_check ?? null;
  const safety = check
    ? { severity: check.safety_severity, description: check.safety_summary, basis: scansMeasured ? `From ${scansMeasured} measured scan${scansMeasured === 1 ? "" : "s"} compared with the plan.` : "From the plan, the traffic model and council data." }
    : demo.safety;
  const traffic = trucks.status === "modelled" ? [...details(cars), ...details(trucks).map(line => `Trucks. ${line}`)] : details(cars);
  const point = (id: keyof SavedReport["points"], label: string, severity: Severity, description: string, reason: string, lines: string[]) => {
    const own = saved?.points[id];
    return { id, label, severity, description: own?.summary ?? description, reason: own?.reason ?? reason, details: own ? [] : lines, checks: own?.checks ?? [] };
  };
  const impactSummary = [
    point("traffic", "Traffic", cars.severity!, describe(cars), cars.severity_reason!, [...traffic, ...gaps("traffic")]),
    point("pedestrians", "Pedestrian access", pedestrians.severity!, describe(pedestrians), pedestrians.severity_reason!, [...details(pedestrians), ...gaps("pedestrians")]),
    point("transport", "Public transport", transport.severity!, describe(transport), transport.severity_reason!, [...details(transport), ...gaps("transport")]),
    point("safety", "Site safety", safety.severity as Severity, safety.description, safety.basis, []),
  ];
  const window = impact.recommended_window;
  const trafficAction = window && !window.window.startsWith("Planned hours") ? {
    id: 0, category: "traffic", title: "Compare a different work window",
    summary: `${window.window}. ${window.reason}`,
    impact: describe(cars),
    why: "Fewer drivers meet the closure when traffic is light, so fewer are diverted or delayed.",
    recommendation: `Compare the planned hours with this window (${window.window.toLowerCase()}), and check the work fits.`,
  } : null;
  const siteActions = check ? check.actions : demo.explanations.actions;
  const actions = pickRecommendations([...findingActions, ...siteActions, ...(trafficAction ? [trafficAction] : [])], impactSummary);
  return {
    period: impact.period,
    overall: impact.overall!.severity,
    overallReason: impact.overall!.reason,
    impactSummary,
    decision: check ? check.decision : demo.explanations.decision,
    conflicts: check?.conflicts ?? [],
    keyFindings: [...impactSummary.map(p => p.description), ...findings.map(f => f.summary)],
    actions,
    sourceNote: `${check && scansMeasured ? `Based on the TGS and ${scansMeasured} measured scan${scansMeasured === 1 ? "" : "s"}.` : check ? "Based on the TGS." : "Based on the TGS. Site findings are sample findings for the demo scan."} Traffic estimate: ${impact.method}${impact.label ? ` (${impact.label.toLowerCase()})` : ""}.`,
    sources: ["TGS analysis", check && scansMeasured ? "Measured site scans" : "Demo site scan", `${impact.method}${impact.label ? `, ${impact.label.toLowerCase()}` : ""}`, ...new Set([...findings.map(f => f.source), ...(saved?.sources ?? [])])],
    method: {
      name: impact.method,
      label: impact.label,
      provenance: PROVENANCE[impact.provenance],
      confidence: `${impact.confidence.charAt(0).toUpperCase()}${impact.confidence.slice(1)}. ${impact.confidence_note}`,
      window: window ? `${window.window}. ${window.reason}` : null,
      assumptions: impact.assumptions,
      visual: impact.visual ?? null,
    },
  };
}

export type AssessmentData = ReturnType<typeof getAssessmentData>;
export type Project = AssessmentData["projects"][number];
export type ReportView = ReturnType<typeof buildReport>;
export type ImpactMetric = ReportView["impactSummary"][number];
