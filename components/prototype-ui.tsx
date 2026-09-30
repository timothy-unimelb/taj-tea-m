"use client";

import Image from "next/image";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRightIcon, CheckIcon, CloudArrowUpIcon, FilePlusIcon, FilePdfIcon, XIcon } from "@phosphor-icons/react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? "brand-compact" : ""}`}>
    <Image
      src={compact ? "/assets/barrier-brain-mark.png" : "/assets/barrier-brain-logo-v2.png"}
      alt="Barrier Brain"
      width={compact ? 28 : 180}
      height={compact ? 28 : 45}
      priority
      draggable={false}
    />
  </span>;
}

// Select original artwork from the supplied board, excluding screenshot UI and device chrome.
const crops = {
  road: [66, 348, 41, 43], tgs: [626, 327, 201, 64],
  lidar: [906, 277, 204, 51], streetscape: [338, 902, 218, 149], aerial: [630, 918, 416, 70],
} as const;

export function ReferenceAsset({ kind, alt, className = "" }: { kind: keyof typeof crops; alt: string; className?: string }) {
  const [x, y, w, h] = crops[kind];
  return <span className={`reference-asset ${className}`} style={{ aspectRatio: `${w}/${h}` }} role="img" aria-label={alt}>
    <Image src="/assets/barrier-brain-reference.png" alt="" width={1448} height={1086} sizes="1448px" draggable={false} style={{ width: `${1448 / w * 100}%`, maxWidth: "none", height: "auto", left: `${-x / w * 100}%`, top: `${-y / h * 100}%` }} />
  </span>;
}

export function PrimaryButton({ children, onClick, disabled = false, arrow = true }: { children: ReactNode; onClick: () => void; disabled?: boolean; arrow?: boolean }) {
  return <button className="primary-button" onClick={onClick} disabled={disabled}>{children}{arrow && <ArrowRightIcon size={19} aria-hidden="true" />}</button>;
}

export function Stepper({ active, tgsComplete = false }: { active: number; tgsComplete?: boolean }) {
  return <ol className="stepper" aria-label="Assessment progress">{["TGS", "Scan", "Report"].map((label, i) => {
    const done = i < active || (i === 0 && tgsComplete);
    return <li key={label} className={done ? "step-done" : i === active ? "step-active" : ""} aria-current={i === active ? "step" : undefined}><span className="step-circle">{done ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : i + 1}</span><span>{label}<span className="sr-only">{done ? ", complete" : i === active ? ", current" : ", pending"}</span></span></li>;
  })}</ol>;
}

// `done` marks each item on its own. Without it, the first `captured` items are done.
// `problems` replaces "Not fully captured" with the reason an item failed.
export function Checklist({ items, details, captured = items.length, done, problems, pending = false, statusLabel = "captured" }: { items: string[]; details?: string[]; captured?: number; done?: boolean[]; problems?: (string | null)[]; pending?: boolean; statusLabel?: string }) {
  return <ul className="checklist">{items.map((item, i) => { const ok = done ? done[i] : i < captured; return <li key={`${i}-${item}`}><span className={`check-symbol ${!ok ? pending ? "pending" : "failed" : ""}`}>{ok ? <CheckIcon size={13} weight="bold" aria-hidden="true" /> : !pending && <XIcon size={12} weight="bold" aria-hidden="true" />}</span><span>{item}{details?.[i] && <small className="checklist-detail">{details[i]}</small>}{!ok && !pending && <small className="error-text">{problems?.[i] ?? "Not fully captured"}</small>}<span className="sr-only">{ok ? `, ${statusLabel}` : pending ? ", required" : ", incomplete"}</span></span></li>; })}</ul>;
}

// `file` is the real upload. It is missing when the demo file is chosen.
export type UploadFile = { name: string; size: string; file?: File };
// A TGS upload takes one file (`file`). A scan upload takes several (`files`, removed one at a time with `onRemove`).
export function UploadPanel({ kind, file = null, files, onFile, onRemove }: { kind: "tgs" | "scan"; file?: UploadFile | null; files?: UploadFile[]; onFile: (file: UploadFile | null) => void; onRemove?: (index: number) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const isTgs = kind === "tgs";
  function selectFiles(list?: FileList | null) {
    const selected = Array.from(list ?? []).slice(0, isTgs ? 1 : undefined);
    if (!selected.length) return;
    const extensions = isTgs ? /\.(pdf|png|jpe?g)$/i : /\.(ply|las)$/i;
    if (selected.some(f => !extensions.test(f.name))) { setError(isTgs ? "Choose a PDF, PNG or JPG file." : "Choose .ply or .las files. Export the scans in one of these formats."); return; }
    if (isTgs && selected[0].size > 20 * 1024 * 1024) { setError("This file is larger than 20 MB. Choose a smaller file."); return; }
    setError("");
    for (const f of selected) onFile({ name: f.name, size: `${Math.max(0.1, f.size / 1024 / 1024).toFixed(1)} MB`, file: f });
  }
  const rows = isTgs ? (file ? [file] : []) : files ?? [];
  return <div className="upload-group">
    <input ref={input} id={id} className="sr-only" type="file" tabIndex={-1} multiple={!isTgs} accept={isTgs ? ".pdf,.png,.jpg,.jpeg" : ".ply,.las"} onChange={e => { selectFiles(e.target.files); e.target.value = ""; }} aria-label={isTgs ? "Choose TGS file" : "Choose site scan files"} />
    <button type="button" className={`upload-panel ${!isTgs ? "upload-compact" : ""} ${dragging ? "dragging" : ""}`} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); selectFiles(e.dataTransfer.files); }} aria-describedby={`${id}-help`}>
      {isTgs ? <FilePlusIcon size={40} weight="light" aria-hidden="true" /> : <CloudArrowUpIcon size={32} weight="light" aria-hidden="true" />}
      <strong>{isTgs ? "Drop your TGS here" : rows.length ? "Upload more scans" : "Upload scans"}</strong>
      <span id={`${id}-help`}>{isTgs ? "PDF, PNG or JPG (max 20 MB)" : "One or more scans. Supported formats: .ply, .las"}</span>
    </button>
    {rows.map((row, i) => <div className="file-row" key={`${row.name}-${i}`}><FilePdfIcon className="file-icon" size={32} aria-hidden="true" /><span><strong>{row.name}</strong><small>{row.size}</small></span><button className="icon-button" aria-label={`Remove ${row.name}`} onClick={() => isTgs ? onFile(null) : onRemove?.(i)}><XIcon size={18} aria-hidden="true" /></button></div>)}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
export function ExternalScanEvidence() {
  return <section className="scan-evidence" aria-labelledby="scan-evidence-title">
    <div className="scan-evidence-heading">
      <div>
        <h2 id="scan-evidence-title">External scan evidence</h2>
        <p>Captured in an external scanning app, then exported for Barrier Brain.</p>
      </div>
      <span className="evidence-badge">External app</span>
    </div>
    <figure className="scan-evidence-primary">
      <Image src="/assets/external-scan-app.png" alt="Mobile scanning app showing the captured street scan" width={1179} height={2556} sizes="(max-width: 430px) 100vw, 390px" />
      <figcaption>Mobile scan capture</figcaption>
    </figure>
    <div className="scan-evidence-exports" aria-label="Exported scan evidence">
      <figure><Image src="/assets/external-scan-colours.png" alt="Point-cloud colour export with numbered scan points" width={910} height={1120} sizes="(max-width: 430px) 50vw, 190px" /><figcaption>Point-cloud export</figcaption></figure>
      <figure><Image src="/assets/external-scan-map.png" alt="Map export showing the scan footprint near Swanston Street" width={993} height={1411} sizes="(max-width: 430px) 50vw, 190px" /><figcaption>Map export</figcaption></figure>
    </div>
  </section>;
}

export function ReportSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`report-section ${className}`}><h2>{title}</h2>{children}</section>;
}
