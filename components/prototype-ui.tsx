"use client";

import Image from "next/image";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRightIcon, CheckIcon, CloudArrowUpIcon, FilePlusIcon, FilePdfIcon, XIcon } from "@phosphor-icons/react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? "brand-compact" : ""}`}><svg aria-hidden="true" viewBox="0 0 40 36" width="32" height="30"><path fill="#216b51" d="M19 1 1 33h18zM22 1v32h17z"/><path fill="#89b8a3" d="m19 1-7 27 7-8zm3 0 7 27-7-8z"/><path fill="#144735" d="m1 33 18-13v13zm38 0L22 20v13z"/></svg><span>Barrier Brain</span></span>;
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

export function Checklist({ items, captured = items.length, pending = false, statusLabel = "captured" }: { items: string[]; captured?: number; pending?: boolean; statusLabel?: string }) {
  return <ul className="checklist">{items.map((item, i) => <li key={item}><span className={`check-symbol ${i >= captured ? pending ? "pending" : "failed" : ""}`}>{i < captured ? <CheckIcon size={13} weight="bold" aria-hidden="true" /> : !pending && <XIcon size={12} weight="bold" aria-hidden="true" />}</span><span>{item}{i >= captured && !pending && <small className="error-text">Not fully captured</small>}<span className="sr-only">{i < captured ? `, ${statusLabel}` : pending ? ", required" : ", incomplete"}</span></span></li>)}</ul>;
}

export type UploadFile = { name: string; size: string };
export function UploadPanel({ kind, file, onFile }: { kind: "tgs" | "scan"; file: UploadFile | null; onFile: (file: UploadFile | null) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const isTgs = kind === "tgs";
  function selectFile(selected?: File) {
    if (!selected) return;
    const extensions = isTgs ? /\.(pdf|png|jpe?g)$/i : /\.(ply|las|e57|zip)$/i;
    if (!extensions.test(selected.name)) { setError(isTgs ? "Choose a PDF, PNG or JPG file." : "Choose a .ply, .las, .e57 or .zip file."); return; }
    if (isTgs && selected.size > 20 * 1024 * 1024) { setError("This file is larger than 20 MB. Choose a smaller file."); return; }
    setError("");
    onFile({ name: selected.name, size: `${Math.max(0.1, selected.size / 1024 / 1024).toFixed(1)} MB` });
  }
  return <div className="upload-group">
    <input ref={input} id={id} className="sr-only" type="file" tabIndex={-1} accept={isTgs ? ".pdf,.png,.jpg,.jpeg" : ".ply,.las,.e57,.zip"} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ""; }} aria-label={isTgs ? "Choose TGS file" : "Choose site scan file"} />
    <button type="button" className={`upload-panel ${!isTgs ? "upload-compact" : ""} ${dragging ? "dragging" : ""}`} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0]); }} aria-describedby={`${id}-help`}>
      {isTgs ? <FilePlusIcon size={40} weight="light" aria-hidden="true" /> : <CloudArrowUpIcon size={32} weight="light" aria-hidden="true" />}
      <strong>{isTgs ? "Drop your TGS here" : "Upload site scan"}</strong>
      <span id={`${id}-help`}>{isTgs ? "PDF, PNG or JPG (max 20 MB)" : "Supported formats: .ply, .las, .e57, .zip"}</span>
    </button>
    {file && <div className="file-row"><FilePdfIcon className="file-icon" size={32} aria-hidden="true" /><span><strong>{file.name}</strong><small>{file.size}</small></span><button className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => onFile(null)}><XIcon size={18} aria-hidden="true" /></button></div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}

export function ReportSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`report-section ${className}`}><h2>{title}</h2>{children}</section>;
}
