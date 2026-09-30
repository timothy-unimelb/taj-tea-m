"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CarIcon, PersonSimpleWalkIcon, BusIcon, WarningIcon, WarningCircleIcon, FileTextIcon, CaretDownIcon, CheckCircleIcon, QuestionIcon } from "@phosphor-icons/react";
import type { ImpactMetric, Project, ReportView } from "@/lib/data";
import { Brand, ReferenceAsset, ReportSection } from "./prototype-ui";

const tabs = [
  { id: "overview", label: "Overview" }, { id: "traffic", label: "Traffic" },
  { id: "pedestrians", label: "Pedestrians" }, { id: "transport", label: "Public transport" }, { id: "safety", label: "Safety" },
];
const metricIcons = { traffic: CarIcon, pedestrians: PersonSimpleWalkIcon, transport: BusIcon, safety: WarningIcon };

export function MetricCard({ metric, detailed = false }: { metric: ImpactMetric; detailed?: boolean }) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons];
  const SeverityIcon = metric.severity === "Low" ? CheckCircleIcon : metric.severity === "Not modelled" ? QuestionIcon : WarningCircleIcon;
  return <article className="metric-card"><Icon size={21} aria-hidden="true" /><div><div className="metric-heading"><h3>{metric.label}</h3><span className={`severity severity-${metric.severity.toLowerCase().replaceAll(" ", "-")}`}><SeverityIcon size={13} weight="fill" aria-hidden="true" />{metric.severity}</span></div><p>{metric.description}</p>{detailed && <ul className="key-findings">{metric.checks.map(c => <li key={c.label}><strong>{c.label}.</strong> {c.text}</li>)}{metric.details.map(line => <li key={line}>{line}</li>)}<li>Rating: {metric.reason}</li></ul>}</div></article>;
}

export type OverviewImage = { src: string; alt: string; caption: string };

// The real plan and scan when there are any. The design board's artwork otherwise.
function SiteImages({ images }: { images: OverviewImage[] }) {
  return <div className="site-images">{images.map(image => <figure key={image.caption}>
    {/* eslint-disable-next-line @next/next/no-img-element -- local object and data URLs */}
    <img src={image.src} alt={image.alt} /><figcaption>{image.caption}</figcaption></figure>)}</div>;
}

export function SiteOverview({ missing = false }: { missing?: boolean }) {
  return <figure className="site-overview"><div className={`site-image ${missing ? "show-missing" : ""}`}><ReferenceAsset kind="aerial" alt="Aerial site overview: orange work zone, blue traffic arrows, dashed yellow pedestrian route, green verified scan points, and numbered callouts 1 and 2" />{missing && <span className="missing-highlight"><span>Intersection approach</span></span>}</div><figcaption className="map-legend"><span><i className="legend-work" />Work zone</span><span><i className="legend-traffic" />Traffic flow</span><span><i className="legend-pedestrian" />Pedestrian route</span><span><i className="legend-verified" />Verified scan</span></figcaption></figure>;
}

// A picture or animation of the model at work, when the result has one.
function MethodVisual({ visual }: { visual: ReportView["method"]["visual"] }) {
  if (!visual) return null;
  return <figure className="method-visual"><Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 430px) 100vw, 390px" unoptimized /><figcaption><p>{visual.caption}</p><div className="map-legend">{visual.legend.map(item => <span key={item.label}><i style={{ background: item.colour }} />{item.label}</span>)}</div></figcaption></figure>;
}

// Which model made the numbers, how, and on what assumptions.
function MethodNote({ report, document }: { report: ReportView; document: boolean }) {
  const { method } = report;
  const title = method.label ? `${method.name} (${method.label.toLowerCase()})` : method.name;
  if (document) return <ReportSection title="How this was estimated"><div className="document-action"><div><h3>{title}</h3><p>{method.provenance}. Confidence: {method.confidence}</p></div></div><ul className="key-findings">{method.assumptions.map(item => <li key={item}>{item}</li>)}</ul><MethodVisual visual={method.visual} /></ReportSection>;
  return <ReportSection title="How this was estimated"><div className="recommendations"><details className="recommendation"><summary><span className="action-number"><FileTextIcon size={15} aria-hidden="true" /></span><span><strong>{title}</strong><small>{method.provenance}. {method.assumptions.length} assumptions.</small></span><CaretDownIcon size={18} aria-hidden="true" /></summary><dl className="action-detail"><dt>Confidence</dt><dd>{method.confidence}</dd>{method.window && <><dt>Best work window</dt><dd>{method.window}</dd></>}<dt>Assumptions</dt><dd><ul>{method.assumptions.map(item => <li key={item}>{item}</li>)}</ul></dd></dl></details></div><MethodVisual visual={method.visual} /></ReportSection>;
}

export function SiteReport({ report, project, document = false, overview = [] }: { report: ReportView; project: Project; document?: boolean; overview?: OverviewImage[] }) {
  const [active, setActive] = useState("overview");
  const tabList = useRef<HTMLDivElement>(null);
  const visibleMetrics = document || active === "overview" ? report.impactSummary : report.impactSummary.filter(metric => metric.id === active);
  const actions = report.actions.filter(action => document || active === "overview" || active === "safety" || action.category === active);
  return <article className={document ? "report document-report" : "report"}>
    {document && <div className="document-brand"><Brand compact /><span>{project.date}</span></div>}
    <header className="report-heading"><div><p className="eyebrow">{document ? "" : "SITE IMPACT REPORT"}</p><h1 tabIndex={-1}>{document ? "Site Impact Report" : project.name}</h1><p className="report-meta">{document ? `${project.name} · ${report.period}` : `${project.date} · ${report.period}`}</p></div><div className="overall-impact"><span className="impact-marker" aria-hidden="true"><WarningCircleIcon size={22} weight="fill" /></span><span><small>Overall impact</small><strong>{report.overall}</strong></span></div></header>
    {!document && <div className="report-tabs" role="tablist" aria-label="Report categories" ref={tabList}>{tabs.map((tab, i) => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls="report-panel" tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => { let next = i; if (event.key === "ArrowRight") next = (i + 1) % tabs.length; else if (event.key === "ArrowLeft") next = (i + tabs.length - 1) % tabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = tabs.length - 1; else return; event.preventDefault(); setActive(tabs[next].id); (tabList.current?.children[next] as HTMLButtonElement)?.focus(); }}>{tab.label}</button>)}</div>}
    <div id={document ? undefined : "report-panel"} role={document ? undefined : "tabpanel"} aria-labelledby={document ? undefined : `tab-${active}`}>
      {document ? <ReportSection title="Key findings"><ul className="key-findings">{report.keyFindings.map(item => <li key={item}>{item}</li>)}</ul></ReportSection> : <><div className="decision-card"><WarningIcon size={26} weight="fill" aria-hidden="true" /><div><h2>Review required before deployment</h2><p>{report.decision}</p></div></div><p className="source-note"><FileTextIcon size={15} aria-hidden="true" />{report.sourceNote}</p></>}
      <ReportSection title="Impact summary"><div className="metrics">{visibleMetrics.map(metric => <MetricCard metric={metric} detailed={document ? metric.checks.length > 0 : active !== "overview"} key={metric.id} />)}</div></ReportSection>
      {report.conflicts.length > 0 && (document || active === "overview" || active === "safety") && <ReportSection title="Plan vs street"><ul className="key-findings">{report.conflicts.map(c => <li key={`${c.scan_point}-${c.measured}`}><strong>{c.scan_point}.</strong> Measured {c.measured}. Needed {c.needed}. {c.finding}</li>)}</ul></ReportSection>}
      <ReportSection title="Site overview">{overview.length ? <SiteImages images={overview} /> : <SiteOverview />}</ReportSection>
      {actions.length > 0 && <ReportSection title={document ? "Recommended actions" : "Recommended before deployment"}><div className="recommendations">{actions.map(action => document ? <div className="document-action" key={action.id}><span className="action-number">{action.id}</span><div><h3>{action.title}</h3><p>{action.point}. {action.summary}</p></div></div> : <details className="recommendation" key={action.id}><summary><span className="action-number">{action.id}</span><span><strong>{action.title}</strong><small>{action.point}. {action.summary}</small></span><CaretDownIcon size={18} aria-hidden="true" /></summary><dl className="action-detail"><dt>Report point</dt><dd>{action.point}</dd><dt>Impact</dt><dd>{action.impact}</dd><dt>Why it matters</dt><dd>{action.why}</dd><dt>Evidence used</dt><dd><ul>{report.sources.map(source => <li key={source}>{source}</li>)}</ul></dd><dt>Recommended action</dt><dd>{action.recommendation}</dd></dl></details>)}</div></ReportSection>}
      {(document || active === "overview") && <MethodNote report={report} document={document} />}
    </div>
  </article>;
}
