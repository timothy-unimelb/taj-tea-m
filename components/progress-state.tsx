"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CircleIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { ReferenceAsset } from "./prototype-ui";

export function ProgressState({ steps, onComplete, illustration = false }: { steps: string[]; onComplete: () => void; illustration?: boolean }) {
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setCompleted(value => Math.min(value + 1, steps.length)), 750);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  useEffect(() => {
    if (completed !== steps.length) return;
    const timer = window.setTimeout(onComplete, 500);
    return () => window.clearTimeout(timer);
  }, [completed, steps.length, onComplete]);
  return <div className="progress-state">
    <div className="sr-only" role="status" aria-live="polite">{completed === steps.length ? "Analysis complete" : steps[completed]}</div>
    <ol className="processing-list">{steps.map((step, i) => <li key={step}><span className={i < completed ? "check-symbol" : i === completed ? "progress-active" : "progress-pending"}>{i < completed ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : i === completed ? <CircleNotchIcon className="spinner" size={24} aria-hidden="true" /> : <CircleIcon size={22} aria-hidden="true" />}</span><span>{step}<span className="sr-only">{i < completed ? ", complete" : i === completed ? ", in progress" : ", pending"}</span></span></li>)}</ol>
    <progress className="processing-bar" aria-label="Analysis progress" max={steps.length} value={completed} />
    {illustration && <ReferenceAsset kind="streetscape" className="streetscape" alt="Soft illustration of a road work zone, traffic cones, a message board and cars on a tree-lined street" />}
  </div>;
}
