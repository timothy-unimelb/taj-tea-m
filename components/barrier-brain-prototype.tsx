"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, CaretRightIcon, CheckIcon, FilePdfIcon, MagnifyingGlassIcon, PlusIcon, ShareNetworkIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { analyseTgs, buildReport, checkSite, demoAnalysis, demoTgsFile, demoTgsUrl, estimateImpact, savedReportFor, type AssessmentData } from "@/lib/data";
import { describeMeasurement, measureScan, scanPreview, scanProblem, type ScanMeasurement } from "@/lib/scan/measure";
import { stitchScans } from "@/lib/scan/stitch";
import { ruleCheck, type SiteCheck } from "@/lib/site-check";
import type { ImpactResult } from "@/lib/impact/types";
import type { TgsAnalysis } from "@/lib/tgs-analysis";
import { Brand, Checklist, ExternalScanEvidence, PrimaryButton, ReferenceAsset, Stepper, UploadPanel, type UploadFile } from "./prototype-ui";
import { ProgressState } from "./progress-state";
import { SiteReport } from "./site-report";

const screens = ["projects", "tgs", "tgs-processing", "tgs-complete", "scan", "scan-checking", "scan-incomplete", "scan-additional", "scan-complete", "generating", "report", "pdf"] as const;
type Screen = typeof screens[number];
const backScreens: Record<Screen, Screen> = { projects: "projects", tgs: "projects", "tgs-processing": "tgs", "tgs-complete": "tgs", scan: "tgs-complete", "scan-checking": "scan", "scan-incomplete": "scan", "scan-additional": "scan-incomplete", "scan-complete": "scan", generating: "scan-complete", report: "projects", pdf: "report" };
function subscribe(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
function snapshot() { return window.location.hash.slice(1) || "projects"; }
const tgsSteps = ["Reading the Traffic Guidance Scheme", "Identifying plan elements", "Identifying areas for site verification"];
const scanSteps = ["Reading site scan", "Checking required areas"];
const stitchSteps = ["Fitting the scans together", "Reading site scan", "Checking required areas"];

export function BarrierBrainPrototype({ data }: { data: AssessmentData }) {
  const location = useSyncExternalStore(subscribe, snapshot, () => "projects");
  const [screenName, projectId] = location.split("/");
  const screen: Screen = screens.includes(screenName as Screen) ? screenName as Screen : "projects";
  const project = data.projects.find(p => p.id === projectId) ?? data.projects[0];
  const [search, setSearch] = useState("");
  const [tgsFile, setTgsFile] = useState<UploadFile | null>(null);
  // One site scan covers every scan point. Without `file` it is the demo scan.
  // Every scan the planner uploads. Entries without `file` are the demo scan.
  const [scanFiles, setScanFiles] = useState<UploadFile[]>([]);
  const extraScanInput = useRef<HTMLInputElement>(null);
  const [demoScanComplete, setDemoScanComplete] = useState(false);
  const [demoScanLoading, setDemoScanLoading] = useState(false);
  const [measured, setMeasured] = useState<ScanMeasurement | string | null>(null);
  const [stitchProgress, setStitchProgress] = useState("");
  const [stitchNote, setStitchNote] = useState<string | null>(null);
  const [siteCheck, setSiteCheck] = useState<SiteCheck | null>(null);
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [tgsAnalysis, setTgsAnalysis] = useState<TgsAnalysis | null>(null);
  const [tgsError, setTgsError] = useState("");
  const [tgsAttempt, setTgsAttempt] = useState(0);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [impactError, setImpactError] = useState("");
  const [impactAttempt, setImpactAttempt] = useState(0);
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
  // Claude reads the TGS while the progress steps play.
  useEffect(() => {
    if (screen !== "tgs-processing") return;
    const controller = new AbortController();
    analyseTgs(tgsFile, controller.signal).then(setTgsAnalysis).catch((error: Error) => { if (error.name !== "AbortError") setTgsError(error.message); });
    return () => controller.abort();
  }, [screen, tgsFile, tgsAttempt]);
  // The impact model runs while the report steps play. A report opened directly runs it on the demo analysis.
  const needsImpact = impact === null && ["generating", "report", "pdf"].includes(screen);
  useEffect(() => {
    if (!needsImpact) return;
    const controller = new AbortController();
    estimateImpact(tgsAnalysis, controller.signal).then(setImpact).catch((error: Error) => { if (error.name !== "AbortError") setImpactError(error.message); });
    return () => controller.abort();
  }, [needsImpact, tgsAnalysis, impactAttempt]);
  // Scan points come from the TGS analysis, so every scan screen shows the same list.
  const points = (tgsAnalysis ?? demoAnalysis).scan_points;
  const realFiles = scanFiles.flatMap(f => f.file ? [f.file] : []);
  const demoScan = scanFiles.length > 0 && realFiles.length === 0;
  const scanLabel = realFiles.length === 1 ? realFiles[0].name : `${realFiles.length} scans, stitched into one`;
  const realScan = realFiles.length && measured && typeof measured !== "string" ? measured : null;
  const scanError = realFiles.length ? (typeof measured === "string" ? measured : realScan ? scanProblem(realScan) : measured === null ? "Not checked yet" : null) : null;
  // The demo scan misses the last area until the additional scan. Real scans, stitched into one, cover every area or none.
  const pointStatus = points.map((_, i) => {
    if (!scanFiles.length) return { ok: false, problem: "Not scanned yet", note: undefined as string | undefined };
    if (demoScan) return demoScanComplete || i < points.length - 1 ? { ok: true, problem: null, note: "Demo scan" } : { ok: false, problem: "Not fully captured", note: "Demo scan" };
    return scanError ? { ok: false, problem: scanError, note: scanLabel } : { ok: true, problem: null, note: `In ${scanLabel}` };
  });
  const capturedCount = pointStatus.filter(p => p.ok).length;
  // The browser stitches and measures the scans while the check steps play. Files never leave the phone.
  useEffect(() => {
    if (screen !== "scan-checking" || !realFiles.length || measured !== null) return;
    let cancelled = false;
    stitchScans(realFiles, message => { if (!cancelled) setStitchProgress(message); }).then(({ file, note }) => { if (!cancelled) { setStitchNote(note); setStitchProgress(""); } return Promise.all([
      measureScan(file),
      scanPreview(file).catch(() => null).then(image => { if (!cancelled) setScanImage(image); }),
    ]); }).then(([result]) => { if (!cancelled) setMeasured(result); }).catch((error: Error) => { if (!cancelled) { setStitchProgress(""); setMeasured(error.message); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, scanFiles, measured]);
  function resetScanResults() { setMeasured(null); setSiteCheck(null); setScanImage(null); setStitchNote(null); setStitchProgress(""); }
  function addScans(files: UploadFile[]) { setScanFiles(current => [...current.filter(f => f.file), ...files]); resetScanResults(); setDemoScanComplete(false); }
  function removeScan(i: number) { setScanFiles(current => current.filter((_, j) => j !== i)); resetScanResults(); }
  // The demo scan is the team's real scan of Swanston St near Grattan St. It loads as a file, so it is measured
  // and checked like any upload. If it can't be fetched, the old stand-in (no file, fixed findings) is used.
  async function chooseDemoScan() {
    setDemoScanLoading(true);
    try {
      const response = await fetch(data.scan.demoFileUrl);
      if (!response.ok) throw new Error(`The demo scan answered ${response.status}`);
      addScans([{ name: data.scan.demoFileName, size: data.scan.demoFileSize, file: new File([await response.blob()], data.scan.demoFileName) }]);
    } catch {
      setScanFiles([{ name: data.scan.demoFileName, size: data.scan.demoFileSize }]); resetScanResults(); setDemoScanComplete(false);
    } finally { setDemoScanLoading(false); }
  }
  function clearScans() { setScanFiles([]); resetScanResults(); setDemoScanComplete(false); }
  // Adds a scan without going back to the upload screen. The demo fills its missing area straight away.
  function uploadAdditional() {
    if (demoScan) { setDemoScanComplete(true); navigate("scan-additional"); return; }
    extraScanInput.current?.click();
  }
  function onExtraScans(list: FileList | null) {
    const files = Array.from(list ?? []).filter(f => /\.(ply|las)$/i.test(f.name));
    if (!files.length) return;
    addScans(files.map(f => ({ name: f.name, size: `${Math.max(0.1, f.size / 1024 / 1024).toFixed(1)} MB`, file: f })));
    navigate("scan-checking");
  }
  // A demo TGS has its report points written in advance. With the demo scan (or no real scan)
  // they are used whole, so the report makes no Claude call. Any other scan is checked live.
  const demoScanFile = realFiles.length === 1 && realFiles[0].name === data.scan.demoFileName;
  const savedReport = savedReportFor(tgsAnalysis);
  const useSaved = savedReport && (!realScan || demoScanFile) ? savedReport : null;
  // Claude compares the plan with the measured scan while the report steps play.
  const needsCheck = realScan !== null && siteCheck === null && screen === "generating" && !useSaved;
  useEffect(() => {
    if (!needsCheck || !realScan) return;
    const controller = new AbortController();
    const site = (tgsAnalysis ?? demoAnalysis).site;
    const input = [{ name: "Site scan", location: `${site.street}, ${site.extent}`, capture: points.map(point => point.name).join(", "), measurement: realScan }];
    // If Claude can't be reached or takes over 90 s, plain rules on the measurements still give findings.
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    checkSite(tgsAnalysis ?? demoAnalysis, input, controller.signal)
      .then(setSiteCheck).catch((error: Error) => { if (error.name !== "AbortError" || timedOut) setSiteCheck(ruleCheck(input)); })
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCheck, impactAttempt]);
  const reportReady = impact !== null && (realScan === null || siteCheck !== null || useSaved !== null);
  const report = useMemo(() => impact ? buildReport(impact, realScan && !useSaved ? siteCheck : null, realScan ? 1 : 0, useSaved) : null, [impact, siteCheck, realScan, useSaved]);
  // A real TGS names the report after its street.
  const reportProject = tgsAnalysis && tgsFile?.file ? { ...project, name: `${tgsAnalysis.site.street} Work Zone`, date: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) } : project;
  const firstMissing = pointStatus.findIndex(p => !p.ok);
  function retryImpact() { setImpactError(""); setImpactAttempt(n => n + 1); }
  const uploadedImage = tgsFile?.file?.type.startsWith("image/") ? tgsFile.file : null;
  const uploadedImageUrl = useMemo(() => uploadedImage ? URL.createObjectURL(uploadedImage) : null, [uploadedImage]);
  useEffect(() => () => { if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl); }, [uploadedImageUrl]);
  const usingDemoTgs = !tgsFile?.file;
  const tgsPreviewUrl = tgsFile && !tgsFile.file ? demoTgsUrl(tgsFile.name) : uploadedImageUrl;
  // A report opened straight from a link has no TGS loaded. It is built from the demo TGS's analysis, so it shows that TGS.
  const reportTgsUrl = tgsPreviewUrl ?? (tgsAnalysis ? null : demoTgsUrl());
  function startTgsAnalysis() { setTgsAnalysis(null); setImpact(null); setTgsError(""); setTgsAttempt(n => n + 1); }
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
    // A draft project loads its demo TGS. Switching to a different one starts its assessment afresh.
    if (status === "Draft") {
      const tgs = demoTgsFile(data.projects.find(p => p.id === id)?.tgs);
      if (tgsFile?.file || tgsFile?.name !== tgs.name) { setTgsFile(tgs); clearScans(); setTgsAnalysis(null); setImpact(null); }
    }
    navigate(saved ?? (status === "Report ready" ? "report" : status === "Analysing" ? "generating" : "tgs"), id);
  }
  function startAssessment() { setTgsFile(null); clearScans(); setTgsAnalysis(null); setImpact(null); navigate("tgs", data.projects[0].id); }
  const isReport = screen === "report";
  const isPdf = screen === "pdf";
  const step = ["tgs", "tgs-processing", "tgs-complete"].includes(screen) ? 0 : screen === "generating" ? 2 : 1;
  const filteredProjects = data.projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return <div className={`mobile-app ${isPdf ? "pdf-mode" : ""}`}>
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); main.current?.querySelector<HTMLElement>("h1")?.focus(); }}>Skip to content</a>
    <header className={`app-header ${isReport || isPdf ? "report-toolbar" : ""}`}>
      {screen === "projects" ? <Brand /> : isReport ? <button className="back-button" onClick={() => navigate("projects")}><XIcon size={18} aria-hidden="true" /><span>Close</span></button> : <button className="back-button" onClick={() => navigate(backScreens[screen])}><ArrowLeftIcon size={18} aria-hidden="true" /><span>Back</span></button>}
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
        {report && reportReady ? <SiteReport report={report} project={reportProject} document={isPdf} overview={[
          ...(reportTgsUrl ? [{ src: reportTgsUrl, alt: "The traffic guidance scheme for this work zone", caption: "Traffic guidance scheme" }] : []),
          ...(realScan && scanImage ? [{ src: scanImage, alt: "Top-down view of the site scan. Ground shaded by height, objects standing on it in red.", caption: `Site scan from above, north up: ground by height, objects in red (${realScan.length_m} m of street)` }] : []),
        ]} /> : impactError ? <><div className="scan-warning" role="alert"><WarningCircleIcon size={25} weight="fill" aria-hidden="true" /><p>{impactError}</p></div><div className="bottom-actions"><PrimaryButton onClick={retryImpact} arrow={false}>Try again</PrimaryButton></div></> : <p className="source-note" role="status">Loading the impact estimate.</p>}
        {isPdf && report && <div className="document-print"><PrimaryButton onClick={() => window.print()} arrow={false}><FilePdfIcon size={20} aria-hidden="true" />Print / Save PDF</PrimaryButton><p>Use your browser’s print options to save this report as a PDF.</p></div>}
      </> : <>
        <Stepper active={step} tgsComplete={screen === "tgs-complete"} />
        {screen === "tgs" && <><div className="page-heading"><h1 tabIndex={-1}>Upload Traffic Guidance Scheme</h1><p>Upload the TGS for this work zone. Barrier Brain will identify the planned work zone, traffic controls and areas that need site verification.</p></div><UploadPanel kind="tgs" file={tgsFile} onFile={setTgsFile} />{!tgsFile && <button className="demo-file-button" onClick={() => setTgsFile(demoTgsFile())}>Use demo TGS</button>}<div className="bottom-actions"><PrimaryButton onClick={() => { startTgsAnalysis(); navigate("tgs-processing"); }} disabled={!tgsFile}>Analyse TGS</PrimaryButton></div></>}
        {screen === "tgs-processing" && <><div className="page-heading"><h1 tabIndex={-1}>Analysing TGS</h1><p>{usingDemoTgs ? "Loading the saved analysis of the demo TGS." : "Identifying the planned work zone, traffic controls and areas that need site verification."}</p></div>{tgsError ? <><div className="scan-warning" role="alert"><WarningCircleIcon size={25} weight="fill" aria-hidden="true" /><p>{tgsError}</p></div><div className="bottom-actions"><PrimaryButton onClick={startTgsAnalysis} arrow={false}>Try again</PrimaryButton><button className="secondary-button" onClick={() => navigate("tgs")}>Choose a different file</button></div></> : <ProgressState key={tgsAttempt} steps={tgsSteps} ready={tgsAnalysis !== null} onComplete={() => navigate("tgs-complete", project.id, true)} />}<TgsPreview url={tgsPreviewUrl} alt="The uploaded traffic guidance scheme" /></>}
        {screen === "tgs-complete" && <><div className="page-heading"><h1 tabIndex={-1}>TGS analysis complete</h1><p>We found the planned work zone and the areas that should be verified on site.</p>{usingDemoTgs && <p>This is a saved analysis of the demo TGS. Upload your own TGS to analyse it now.</p>}</div><section className="flow-section"><h2>Plan elements</h2><Checklist items={tgsAnalysis?.plan_elements ?? data.tgs.findings} statusLabel="identified" /></section><TgsPreview url={tgsPreviewUrl} alt="The analysed traffic guidance scheme" /><section className="flow-section"><h2>Areas requiring site verification</h2><Checklist items={tgsAnalysis?.scan_points.map(point => point.name) ?? data.tgs.requiredVerification} details={tgsAnalysis?.scan_points.map(point => point.location)} statusLabel="identified for verification" /></section>{tgsAnalysis && tgsAnalysis.uncertainties.length > 0 && <section className="flow-section"><h2>Not clear on the plan</h2><Checklist items={tgsAnalysis.uncertainties} captured={0} pending /></section>}<div className="bottom-actions"><PrimaryButton onClick={() => navigate("scan")}>Continue to site scan</PrimaryButton></div></>}
        {screen === "scan" && <><div className="page-heading"><h1 tabIndex={-1}>Upload site scans</h1><p>Scan every required area in your photogrammetry scanning app, then upload the exported scans here. Several scans are stitched into one.</p></div>{scanFiles.length > 0 && <ExternalScanEvidence />}<UploadPanel kind="scan" files={scanFiles} onFile={file => { if (file) addScans([file]); }} onRemove={removeScan} />{!scanFiles.length && <button className="demo-file-button" onClick={chooseDemoScan} disabled={demoScanLoading}>{demoScanLoading ? "Loading the demo site scan" : "Use demo site scan"}</button>}<section className="flow-section"><h2>Required areas to verify</h2><Checklist items={points.map(point => point.name)} details={points.map(point => point.capture)} captured={0} pending /></section><div className="bottom-actions"><PrimaryButton onClick={() => navigate("scan-checking")} disabled={!scanFiles.length}>Check scan completeness</PrimaryButton></div></>}
        {(screen === "scan-checking" || screen === "scan-additional") && <><div className="page-heading"><h1 tabIndex={-1}>{screen === "scan-additional" ? "Checking additional scan" : "Checking scan completeness"}</h1><p>{realFiles.length > 1 ? "Stitching the scans into one, then checking it covers" : "Checking the scan covers"} the site: enough street, and the kerb.</p></div><ProgressState steps={realFiles.length > 1 ? stitchSteps : scanSteps} ready={screen === "scan-additional" || !realFiles.length || measured !== null} onComplete={() => navigate(screen === "scan-additional" || pointStatus.every(p => p.ok) ? "scan-complete" : "scan-incomplete", project.id, true)} />{stitchProgress && <p className="source-note" role="status">{stitchProgress}</p>}<ReferenceAsset kind="lidar" className="lidar-preview" alt="External LiDAR point-cloud scan" /></>}
        {screen === "scan-incomplete" && <><div className="page-heading"><h1 tabIndex={-1}>Site scan incomplete</h1><p>{capturedCount} of {points.length} required areas captured.</p></div><Checklist items={points.map(point => point.name)} details={pointStatus.map(p => p.note ?? "")} done={pointStatus.map(p => p.ok)} problems={pointStatus.map(p => p.problem)} /><div className="scan-warning"><WarningCircleIcon size={25} weight="fill" aria-hidden="true" /><p>Scan {pointStatus.filter(p => !p.ok).length === 1 ? "this area" : "these areas"} again before continuing.</p></div><div className="bottom-actions"><PrimaryButton onClick={uploadAdditional} arrow={false}>Upload additional scan</PrimaryButton><button className="secondary-button" onClick={() => missingDialog.current?.showModal()}>View missing area</button></div></>}
        {screen === "scan-complete" && <><div className="page-heading"><h1 tabIndex={-1}>Site scan complete</h1><p>All required areas are captured and ready for impact analysis.</p></div><div className="completion-card"><span className="large-check"><CheckIcon size={32} aria-hidden="true" /></span><div><strong>{capturedCount} of {points.length}</strong><p>required areas captured</p></div></div>{realScan && <p className="source-note">Measured: {describeMeasurement(realScan)}. {realScan.notes.join(" ")}</p>}{stitchNote && <p className="source-note">{stitchNote}</p>}<Checklist items={points.map(point => point.name)} details={pointStatus.map(p => p.note ?? "")} done={pointStatus.map(p => p.ok)} /><div className="bottom-actions"><PrimaryButton onClick={() => { setImpact(null); setSiteCheck(null); setImpactError(""); navigate("generating"); }}>Generate impact report</PrimaryButton></div></>}
        {screen === "generating" && <><div className="page-heading"><h1 tabIndex={-1}>Generating site impact report</h1><p>Combining the TGS, verified site geometry and reference data to identify knock-on effects.</p></div>{impactError ? <><div className="scan-warning" role="alert"><WarningCircleIcon size={25} weight="fill" aria-hidden="true" /><p>{impactError}</p></div><div className="bottom-actions"><PrimaryButton onClick={retryImpact} arrow={false}>Try again</PrimaryButton></div></> : <ProgressState key={impactAttempt} steps={data.analysis.steps} ready={reportReady} onComplete={() => navigate("report", project.id, true)} illustration />}</>}
      </>}
    </main>
    <div className={`toast ${notification ? "toast-visible" : ""}`} role="status" aria-live="polite">{notification && <><CheckIcon size={18} aria-hidden="true" />{notification}</>}</div>
    <input ref={extraScanInput} className="sr-only" type="file" multiple tabIndex={-1} accept=".ply,.las" aria-label="Choose additional scan files" onChange={e => { onExtraScans(e.target.files); e.target.value = ""; }} />
    <dialog ref={missingDialog} className="app-dialog" aria-labelledby="missing-title"><div className="dialog-heading"><h2 id="missing-title">{points[firstMissing]?.name ?? "Missing area"}</h2><button className="icon-button" onClick={() => missingDialog.current?.close()} aria-label="Close missing area"><XIcon size={20} /></button></div><p className="error-text">{pointStatus[firstMissing]?.problem ?? "Not fully captured"}</p><p>{points[firstMissing]?.location}</p><p>The scan must include: {points[firstMissing]?.capture}</p><PrimaryButton onClick={() => { missingDialog.current?.close(); uploadAdditional(); }} arrow={false}>Upload additional scan</PrimaryButton></dialog>
    <dialog ref={shareDialog} className="app-dialog" aria-labelledby="share-title"><div className="dialog-heading"><h2 id="share-title">Share report</h2><button className="icon-button" onClick={() => shareDialog.current?.close()} aria-label="Close share"><XIcon size={20} /></button></div><p>Copy this link to share the demo report.</p><input className="share-input" aria-label="Report link" readOnly value={shareUrl} onFocus={e => e.target.select()} /></dialog>
  </div>;
}

// Shows the TGS that was actually analysed. Falls back to the design board's drawing for PDFs.
function TgsPreview({ url, alt }: { url: string | null; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- object URLs from uploads can't go through next/image
  return url ? <img className="tgs-upload-preview" src={url} alt={alt} /> : <ReferenceAsset kind="tgs" className="tgs-preview" alt="Traffic guidance scheme with orange work zone and traffic control signs" />;
}
