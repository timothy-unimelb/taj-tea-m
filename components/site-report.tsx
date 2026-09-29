"use client";

import { useRef, useState } from "react";
import { CarIcon, PersonSimpleWalkIcon, BusIcon, WarningIcon, WarningCircleIcon, FileTextIcon, CaretDownIcon, CheckCircleIcon } from "@phosphor-icons/react";
import type { AssessmentData, ImpactMetric, Project } from "@/lib/data";
import { Brand, ReferenceAsset, ReportSection } from "./prototype-ui";

const tabs = [
  { id: "overview", label: "Overview" }, { id: "traffic", label: "Traffic" },
  { id: "pedestrians", label: "Pedestrians" }, { id: "transport", label: "Public transport" }, { id: "safety", label: "Safety" },
];
const metricIcons = { traffic: CarIcon, pedestrians: PersonSimpleWalkIcon, transport: BusIcon, safety: WarningIcon };

export function MetricCard({ metric }: { metric: ImpactMetric }) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons];
  return <article className="metric-card"><Icon size={21} aria-hidden="true" /><div><div className="metric-heading"><h3>{metric.label}</h3><span className={`severity severity-${metric.severity.toLowerCase()}`}>{metric.severity === "Low" ? <CheckCircleIcon size={13} weight="fill" aria-hidden="true" /> : <WarningCircleIcon size={13} weight="fill" aria-hidden="true" />}{metric.severity}</span></div><p>{metric.description}</p></div></article>;
}

export function SiteOverview({ missing = false }: { missing?: boolean }) {
  return <figure className="site-overview"><div className={`site-image ${missing ? "show-missing" : ""}`}><ReferenceAsset kind="aerial" alt="Aerial site overview: orange work zone, blue traffic arrows, dashed yellow pedestrian route, green verified scan points, and numbered callouts 1 and 2" />{missing && <span className="missing-highlight"><span>Intersection approach</span></span>}</div><figcaption className="map-legend"><span><i className="legend-work" />Work zone</span><span><i className="legend-traffic" />Traffic flow</span><span><i className="legend-pedestrian" />Pedestrian route</span><span><i className="legend-verified" />Verified scan</span></figcaption></figure>;
}

export function SiteReport({ data, project, document = false }: { data: AssessmentData; project: Project; document?: boolean }) {
  const [active, setActive] = useState("overview");
  const tabList = useRef<HTMLDivElement>(null);
  const visibleMetrics = document || active === "overview" ? data.impactSummary : data.impactSummary.filter(metric => metric.id === active);
  const actions = data.explanations.actions.filter(action => document || active === "overview" || active === "safety" || action.category === active);
  return <article className={document ? "report document-report" : "report"}>
    {document && <div className="document-brand"><Brand compact /><span>{project.date}</span></div>}
    <header className="report-heading"><div><p className="eyebrow">{document ? "" : "SITE IMPACT REPORT"}</p><h1 tabIndex={-1}>{document ? "Site Impact Report" : project.name}</h1><p className="report-meta">{document ? project.name : `${project.date} · ${data.analysis.period}`}</p></div><div className="overall-impact"><span className="impact-marker" aria-hidden="true"><WarningCircleIcon size={22} weight="fill" /></span><span><small>Overall impact</small><strong>{data.analysis.severity.overall}</strong></span></div></header>
    {!document && <div className="report-tabs" role="tablist" aria-label="Report categories" ref={tabList}>{tabs.map((tab, i) => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls="report-panel" tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => { let next = i; if (event.key === "ArrowRight") next = (i + 1) % tabs.length; else if (event.key === "ArrowLeft") next = (i + tabs.length - 1) % tabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = tabs.length - 1; else return; event.preventDefault(); setActive(tabs[next].id); (tabList.current?.children[next] as HTMLButtonElement)?.focus(); }}>{tab.label}</button>)}</div>}
    <div id={document ? undefined : "report-panel"} role={document ? undefined : "tabpanel"} aria-labelledby={document ? undefined : `tab-${active}`}>
      {document ? <ReportSection title="Key findings"><ul className="key-findings">{data.explanations.keyFindings.map(item => <li key={item}>{item}</li>)}</ul></ReportSection> : <><div className="decision-card"><WarningIcon size={26} weight="fill" aria-hidden="true" /><div><h2>Review required before deployment</h2><p>{data.explanations.decision}</p></div></div><p className="source-note"><FileTextIcon size={15} aria-hidden="true" />{data.explanations.sourceNote}</p></>}
      <ReportSection title="Impact summary"><div className="metrics">{visibleMetrics.map(metric => <MetricCard metric={metric} key={metric.id} />)}</div></ReportSection>
      <ReportSection title="Site overview"><SiteOverview /></ReportSection>
      {actions.length > 0 && <ReportSection title={document ? "Recommended actions" : "Recommended before deployment"}><div className="recommendations">{actions.map(action => document ? <div className="document-action" key={action.id}><span className="action-number">{action.id}</span><div><h3>{action.title}</h3><p>{action.summary}</p></div></div> : <details className="recommendation" key={action.id}><summary><span className="action-number">{action.id}</span><span><strong>{action.title}</strong><small>{action.summary}</small></span><CaretDownIcon size={18} aria-hidden="true" /></summary><dl className="action-detail"><dt>Impact</dt><dd>{action.impact}</dd><dt>Why it matters</dt><dd>{action.why}</dd><dt>Evidence used</dt><dd><ul>{data.analysis.sources.map(source => <li key={source}>{source}</li>)}</ul></dd><dt>Recommended action</dt><dd>{action.recommendation}</dd></dl></details>)}</div></ReportSection>}
    </div>
    <footer className="report-footer"><p>{data.explanations.disclaimer}</p><p className="demo-note">Demo assessment · Sample analysis data</p></footer>
  </article>;
}
