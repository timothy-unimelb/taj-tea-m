"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, CaretRightIcon, CheckIcon, FilePdfIcon, MagnifyingGlassIcon, PlusIcon, ShareNetworkIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import type { AssessmentData } from "@/lib/data";
import { Brand, Checklist, ExternalScanEvidence, PrimaryButton, ReferenceAsset, Stepper, UploadPanel, type UploadFile } from "./prototype-ui";
import { ProgressState } from "./progress-state";
import { SiteOverview, SiteReport } from "./site-report";

const screens = ["projects", "tgs", "tgs-processing", "tgs-complete", "scan", "scan-checking", "scan-incomplete", "scan-additional", "scan-complete", "generating", "report", "pdf"] as const;
type Screen = typeof screens[number];
const backScreens: Record<Screen, Screen> = { projects: "projects", tgs: "projects", "tgs-processing": "tgs", "tgs-complete": "tgs", scan: "tgs-complete", "scan-checking": "scan", "scan-incomplete": "scan", "scan-additional": "scan-incomplete", "scan-complete": "scan", generating: "scan-complete", report: "projects", pdf: "report" };
function subscribe(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
function snapshot() { return window.location.hash.slice(1) || "projects"; }
const tgsSteps = ["Reading the Traffic Guidance Scheme", "Identifying plan elements", "Identifying areas for site verification"];
const scanSteps = ["Reading site scan", "Checking required areas"];

export function BarrierBrainPrototype({ data }: { data: AssessmentData }) {
  const location = useSyncExternalStore(subscribe, snapshot, () => "projects");
  const [screenName, projectId] = location.split("/");
  const screen: Screen = screens.includes(screenName as Screen) ? screenName as Screen : "projects";
  const project = data.projects.find(p => p.id === projectId) ?? data.projects[0];
  const [search, setSearch] = useState("");
  const [tgsFile, setTgsFile] = useState<UploadFile | null>(null);
  const [scanFile, setScanFile] = useState<UploadFile | null>(null);
  const [notification, setNotification] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const missingDialog = useRef<HTMLDialogElement>(null);
  const shareDialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);

  const navigate = useCallback((next: Screen, id = project.id, replace = false) => {
    const hash = next === "projects" ? "#projects" : `#${next}/${id}`;
    if (replace) { window.history.replaceState(null, "", hash); window.dispatchEvent(new HashChangeEvent("hashchange")); }
    else window.location.hash = hash;
  }, [project.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    main.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    if (!["projects", "tgs-processing", "scan-checking", "scan-additional", "generating", "pdf"].includes(screen)) {
      try { localStorage.setItem(`barrier-brain:${project.id}`, screen); } catch { /* A private browser still supports the complete demo. */ }
    }
  }, [screen, project.id]);
  useEffect(() => { if (!notification) return; const timer = window.setTimeout(() => setNotification(""), 4500); return () => window.clearTimeout(timer); }, [notification]);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}#report/${project.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Barrier Brain: ${project.name}`, text: "Site Impact Report", url }); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setNotification("Report link copied"); }
    catch { setShareUrl(url); shareDialog.current?.showModal(); }
  }
  function openProject(id: string, status: string) {
    let saved: Screen | null = null;
    try { const value = localStorage.getItem(`barrier-brain:${id}`); if (screens.includes(value as Screen)) saved = value as Screen; } catch { /* No persistence available. */ }
    if (status === "Draft") setTgsFile({ name: data.tgs.fileName, size: data.tgs.size });
    navigate(saved ?? (status === "Report ready" ? "report" : status === "Analysing" ? "generating" : "tgs"), id);
  }
  function startAssessment() { setTgsFile(null); setScanFile(null); navigate("tgs", data.projects[0].id); }
  const isReport = screen === "report";
  const isPdf = screen === "pdf";
  const step = ["tgs", "tgs-processing", "tgs-complete"].includes(screen) ? 0 : screen === "generating" ? 2 : 1;
  const filteredProjects = data.projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return <div className={`mobile-app ${isPdf ? "pdf-mode" : ""}`}>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); main.current?.querySelector<HTMLElement>("h1")?.focus(); }}>Skip to content</a>
    <header className={`app-header ${isReport || isPdf ? "report-toolbar" : ""}`}>
      {screen === "projects" ? <Brand /> : <button className="back-button" onClick={() => navigate(backScreens[screen])}><ArrowLeftIcon size={18} aria-hidden="true" /><span>Back</span></button>}
      {isPdf && <span className="document-filename">{project.name.replaceAll(" ", "_")}_Report.pdf</span>}
      {(isReport || isPdf) && <div className="toolbar-actions"><button className="toolbar-button" onClick={share} aria-label="Share report"><ShareNetworkIcon size={20} aria-hidden="true" />{!isPdf && <span>Share</span>}</button>{isReport && <button className="toolbar-button" onClick={() => navigate("pdf")}><FilePdfIcon size={20} aria-hidden="true" /><span>Export PDF</span></button>}</div>}
    </header>

    <main id="main-content" ref={main} className={`screen screen-${screen}`} key={location}>
      {screen === "projects" ? <>
        <div className="page-heading"><h1 tabIndex={-1}>Projects</h1><p>Assess temporary infrastructure before deployment.</p></div>
        <PrimaryButton onClick={startAssessment} arrow={false}><PlusIcon size={20} aria-hidden="true" />New assessment</PrimaryButton>
        <label className="search-box"><MagnifyingGlassIcon size={20} aria-hidden="true" /><span className="sr-only">Search projects</span><input type="search" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <section className="projects-section"><h2>Recent projects</h2><div className="project-list">{filteredProjects.map(p => <button key={p.id} className="project-card" onClick={() => openProject(p.id, p.status)}><ReferenceAsset kind="road" alt="Street work zone" /><span className="project-info"><strong>{p.name}</strong><span className="project-meta"><time>{p.date}</time><span className={`project-status status-${p.status.toLowerCase().replaceAll(" ", "-")}`}>{p.status}</span></span></span><CaretRightIcon size={17} aria-hidden="true" /></button>)}</div>{filteredProjects.length === 0 && <p className="empty-state" role="status">No projects match “{search}”.</p>}</section>
      </> : isReport || isPdf ? <>
        <SiteReport data={data} project={project} document={isPdf} />
        {isPdf && <div className="document-print"><PrimaryButton onClick={() => window.print()} arrow={false}><FilePdfIcon size={20} aria-hidden="true" />Print / Save PDF</PrimaryButton><p>Use your browser’s print options to save this report as a PDF.</p></div>}
      </> : <>
        <Stepper active={step} tgsComplete={screen === "tgs-complete"} />
        {screen === "tgs" && <><div className="page-heading"><h1 tabIndex={-1}>Upload Traffic Guidance Scheme</h1><p>Upload the TGS for this work zone. Barrier Brain will identify the planned work zone, traffic controls and areas that need site verification.</p></div><UploadPanel kind="tgs" file={tgsFile} onFile={setTgsFile} />{!tgsFile && <button className="demo-file-button" onClick={() => setTgsFile({ name: data.tgs.fileName, size: data.tgs.size })}>Use demo TGS</button>}<div className="bottom-actions"><PrimaryButton onClick={() => navigate("tgs-processing")} disabled={!tgsFile}>Analyse TGS</PrimaryButton></div></>}
        {screen === "tgs-processing" && <><div className="page-heading"><h1 tabIndex={-1}>Analysing TGS</h1><p>Identifying the planned work zone, traffic controls and areas that need site verification.</p></div><ProgressState steps={tgsSteps} onComplete={() => navigate("tgs-complete", project.id, true)} /><ReferenceAsset kind="tgs" className="tgs-preview" alt="Traffic guidance scheme with orange work zone and traffic control signs" /></>}
        {screen === "tgs-complete" && <><div className="page-heading"><h1 tabIndex={-1}>TGS analysis complete</h1><p>We found the planned work zone and the areas that should be verified on site.</p></div><section className="flow-section"><h2>Plan elements</h2><Checklist items={data.tgs.findings} statusLabel="identified" /></section><ReferenceAsset kind="tgs" className="tgs-preview" alt="Traffic guidance scheme showing the planned work zone and control devices" /><section className="flow-section"><h2>Areas requiring site verification</h2><Checklist items={data.tgs.requiredVerification} statusLabel="identified for verification" /></section><div className="bottom-actions"><PrimaryButton onClick={() => navigate("scan")}>Continue to site scan</PrimaryButton></div></>}
        {screen === "scan" && <><div className="page-heading"><h1 tabIndex={-1}>Upload site scan</h1><p>Complete the required areas in your LiDAR scanning app, then upload the exported site scan here.</p></div><ExternalScanEvidence /><UploadPanel kind="scan" file={scanFile} onFile={setScanFile} />{!scanFile && <button className="demo-file-button" onClick={() => setScanFile({ name: data.scan.demoFileName, size: data.scan.demoFileSize })}>Use demo site scan</button>}<section className="flow-section"><h2>Required areas to verify</h2><Checklist items={data.tgs.requiredVerification} captured={3} pending /></section><div className="bottom-actions"><PrimaryButton onClick={() => navigate("scan-checking")} disabled={!scanFile}>Check scan completeness</PrimaryButton></div></>}
        {(screen === "scan-checking" || screen === "scan-additional") && <><div className="page-heading"><h1 tabIndex={-1}>{screen === "scan-additional" ? "Checking additional scan" : "Checking scan completeness"}</h1><p>Checking the scan covers the required site areas.</p></div><ProgressState steps={scanSteps} onComplete={() => navigate(screen === "scan-additional" ? "scan-complete" : "scan-incomplete", project.id, true)} /><ReferenceAsset kind="lidar" className="lidar-preview" alt="External LiDAR point-cloud scan" /></>}
        {screen === "scan-incomplete" && <><div className="page-heading"><h1 tabIndex={-1}>Site scan incomplete</h1><p>{data.scan.initialCaptured} of {data.scan.areas.length} required areas captured.</p></div><Checklist items={data.scan.areas} captured={data.scan.initialCaptured} /><div className="scan-warning"><WarningCircleIcon size={25} weight="fill" aria-hidden="true" /><p>Scan this area again before continuing.</p></div><div className="bottom-actions"><PrimaryButton onClick={() => navigate("scan-additional")} arrow={false}>Upload additional scan</PrimaryButton><button className="secondary-button" onClick={() => missingDialog.current?.showModal()}>View missing area</button></div></>}
        {screen === "scan-complete" && <><div className="page-heading"><h1 tabIndex={-1}>Site scan complete</h1><p>All required areas are captured and ready for impact analysis.</p></div><div className="completion-card"><span className="large-check"><CheckIcon size={32} aria-hidden="true" /></span><div><strong>{data.scan.completeCaptured} of {data.scan.areas.length}</strong><p>required areas captured</p></div></div><Checklist items={data.scan.areas} /><div className="bottom-actions"><PrimaryButton onClick={() => navigate("generating")}>Generate impact report</PrimaryButton></div></>}
        {screen === "generating" && <><div className="page-heading"><h1 tabIndex={-1}>Generating site impact report</h1><p>Combining the TGS, verified site geometry and reference data to identify knock-on effects.</p></div><ProgressState steps={data.analysis.steps} onComplete={() => navigate("report", project.id, true)} illustration /></>}
      </>}
    </main>
    <div className={`toast ${notification ? "toast-visible" : ""}`} role="status" aria-live="polite">{notification && <><CheckIcon size={18} aria-hidden="true" />{notification}</>}</div>
    <dialog ref={missingDialog} className="app-dialog" aria-labelledby="missing-title"><div className="dialog-heading"><h2 id="missing-title">Intersection approach</h2><button className="icon-button" onClick={() => missingDialog.current?.close()} aria-label="Close missing area"><XIcon size={20} /></button></div><p className="error-text">Not fully captured</p><SiteOverview missing /><p>Scan this area again before continuing.</p><PrimaryButton onClick={() => { missingDialog.current?.close(); navigate("scan-additional"); }} arrow={false}>Upload additional scan</PrimaryButton></dialog>
    <dialog ref={shareDialog} className="app-dialog" aria-labelledby="share-title"><div className="dialog-heading"><h2 id="share-title">Share report</h2><button className="icon-button" onClick={() => shareDialog.current?.close()} aria-label="Close share"><XIcon size={20} /></button></div><p>Copy this link to share the demo report.</p><input className="share-input" aria-label="Report link" readOnly value={shareUrl} onFocus={e => e.target.select()} /></dialog>
  </div>;
}
