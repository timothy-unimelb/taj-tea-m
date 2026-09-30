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

export function MetricCard({ metric, detailed = false, time = null }: { metric: ImpactMetric; detailed?: boolean; time?: string | null }) {
  const Icon = metricIcons[metric.id as keyof typeof metricIcons];
  const SeverityIcon = metric.severity === "Low" ? CheckCircleIcon : metric.severity === "Not modelled" ? QuestionIcon : WarningCircleIcon;
  return <article className="metric-card"><Icon size={21} aria-hidden="true" /><div><div className="metric-heading"><h3>{metric.label}</h3><span className={`severity severity-${metric.severity.toLowerCase().replaceAll(" ", "-")}`}><SeverityIcon size={13} weight="fill" aria-hidden="true" />{metric.severity}</span></div><p>{metric.description}</p>{detailed && <CheckRows metric={metric} time={time} />}</div></article>;
}

// Each check leads with its answer; the line under it says why. Site safety checks are
// numbered actions, tagged with the report point they come from.
function CheckRows({ metric, time }: { metric: ImpactMetric; time: string | null }) {
  const actions = metric.id === "safety";
  const checks = metric.checks.map(c => ({ ...c, ...(time ? c.by_time?.[time] : undefined) }));
  return <>
    {checks.length > 0 && <ol className={`check-rows ${actions ? "check-actions" : ""}`}>{checks.map((c, i) => <li key={i} className={`check-row check-${c.status ?? "watch"}`}>
      {actions ? <><span className="check-answer"><span className="check-number">{i + 1}</span>{c.label}</span>{c.answer && <span className="check-tag">{c.answer}</span>}</> : <><span className="check-label">{c.label}</span>{c.answer && <span className="check-answer">{c.answer}</span>}</>}
      <span className="check-note">{c.text}</span>
    </li>)}</ol>}
    {metric.details.length > 0 && <ul className="key-findings">{metric.details.map(line => <li key={line}>{line}</li>)}</ul>}
    <p className="check-reason">Why {metric.severity.toLowerCase()}: {metric.reason}</p>
  </>;
}

// Three fixed stops. The checks that change through the day follow it.
function TimeSlider({ times, value, onChange }: { times: ReportView["times"]; value: string; onChange: (id: string) => void }) {
  const index = Math.max(0, times.findIndex(t => t.id === value));
  const current = times[index];
  return <div className="time-slider">
    <div className="time-slider-heading"><label htmlFor="report-time">Time of day</label><span>Traffic {current.traffic_window}</span></div>
    <input id="report-time" type="range" min={0} max={times.length - 1} step={1} value={index} onChange={e => onChange(times[Number(e.target.value)].id)} aria-valuetext={current.label} />
    <div className="time-slider-ticks" aria-hidden="true">{times.map(t => <button type="button" tabIndex={-1} key={t.id} className={t.id === value ? "active" : ""} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
  </div>;
}

function DayTable({ report }: { report: ReportView }) {
  if (!report.dayTable || !report.times.length) return null;
  return <ReportSection title="Through the works day"><table className="day-table"><thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{report.times.map(t => <th scope="col" key={t.id}>{t.label}</th>)}</tr></thead><tbody>{report.dayTable.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{report.times.map(t => <td key={t.id}>{row.values[t.id]}</td>)}</tr>)}</tbody></table><p className="day-table-note">{report.dayTable.note}</p></ReportSection>;
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
  // Starts at the busiest time, midday, when the report has times of day.
  const [time, setTime] = useState(report.times.find(t => t.id === "12pm")?.id ?? report.times[0]?.id ?? "");
  const tabList = useRef<HTMLDivElement>(null);
  const visibleMetrics = document || active === "overview" ? report.impactSummary : report.impactSummary.filter(metric => metric.id === active);
  const actions = report.actions.filter(action => document || active === "overview" || active === "safety" || action.category === active);
  return <article className={document ? "report document-report" : "report"}>
    {document && <div className="document-brand"><Brand compact /><span>{project.date}</span></div>}
    <header className="report-heading"><div><p className="eyebrow">{document ? "" : "SITE IMPACT REPORT"}</p><h1 tabIndex={-1}>{document ? "Site Impact Report" : project.name}</h1><p className="report-meta">{document ? `${project.name} · ${report.period}` : `${project.date} · ${report.period}`}</p></div><div className="overall-impact"><span className="impact-marker" aria-hidden="true"><WarningCircleIcon size={22} weight="fill" /></span><span><small>Overall impact</small><strong>{report.overall}</strong></span></div></header>
    {!document && <div className="report-tabs" role="tablist" aria-label="Report categories" ref={tabList}>{tabs.map((tab, i) => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls="report-panel" tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => { let next = i; if (event.key === "ArrowRight") next = (i + 1) % tabs.length; else if (event.key === "ArrowLeft") next = (i + tabs.length - 1) % tabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = tabs.length - 1; else return; event.preventDefault(); setActive(tabs[next].id); (tabList.current?.children[next] as HTMLButtonElement)?.focus(); }}>{tab.label}</button>)}</div>}
    <div id={document ? undefined : "report-panel"} role={document ? undefined : "tabpanel"} aria-labelledby={document ? undefined : `tab-${active}`}>
      {document ? <ReportSection title="Key findings"><ul className="key-findings">{report.keyFindings.map(item => <li key={item}>{item}</li>)}</ul></ReportSection> : <><div className="decision-card"><WarningIcon size={26} weight="fill" aria-hidden="true" /><div><h2>Review required before deployment</h2><p>{report.decision}</p></div></div><p className="source-note"><FileTextIcon size={15} aria-hidden="true" />{report.sourceNote}</p></>}
      {!document && report.times.length > 0 && <TimeSlider times={report.times} value={time} onChange={setTime} />}
      <ReportSection title="Impact summary"><div className="metrics">{visibleMetrics.map(metric => <MetricCard metric={metric} detailed={document ? metric.checks.length > 0 : active !== "overview"} time={document ? null : time || null} key={metric.id} />)}</div></ReportSection>
      {document && <DayTable report={report} />}
      {report.conflicts.length > 0 && (document || active === "safety") && <ReportSection title="Plan vs street"><ol className="check-rows plan-vs-street">{report.conflicts.map(c => <li key={`${c.scan_point}-${c.measured}`} className="check-row check-watch"><span className="check-label">{c.scan_point}</span><span className="check-answer">Needs {c.needed}</span><span className="check-note">{c.measured}. {c.finding}</span></li>)}</ol></ReportSection>}
      <ReportSection title="Site overview">{overview.length ? <SiteImages images={overview} /> : <SiteOverview />}</ReportSection>
      {actions.length > 0 && <ReportSection title={document ? "Recommended actions" : "Recommended before deployment"}><div className="recommendations">{actions.map(action => document ? <div className="document-action" key={action.id}><span className="action-number">{action.id}</span><div><h3>{action.title}</h3><p>{action.point}. {action.summary}</p></div></div> : <details className="recommendation" key={action.id}><summary><span className="action-number">{action.id}</span><span><strong>{action.title}</strong><small>{action.point}</small></span><CaretDownIcon size={18} aria-hidden="true" /></summary><dl className="action-detail"><dt>What</dt><dd>{action.summary}</dd><dt>Impact</dt><dd>{action.impact}</dd><dt>Why it matters</dt><dd>{action.why}</dd><dt>Evidence used</dt><dd><ul>{report.sources.map(source => <li key={source}>{source}</li>)}</ul></dd><dt>Recommended action</dt><dd>{action.recommendation}</dd></dl></details>)}</div></ReportSection>}
      {(document || active === "overview") && <MethodNote report={report} document={document} />}
    </div>
  </article>;
}
