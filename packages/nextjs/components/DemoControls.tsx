"use client";

import { useState } from "react";

interface Props {
  taskId: number;
  status: string; // "Created" | "Accepted" | "ZKPassed" | "Deliberating" | "Resolved"
}

type Step = "accept" | "submit" | "jury";
type StepStatus = "idle" | "loading" | "done" | "error";

const STEP_CONFIG: Record<Step, { label: string; loadingLabel: string; visibleOn: string[] }> = {
  accept: {
    label: "Agent B: Accept Task",
    loadingLabel: "Accepting...",
    visibleOn: ["Created"],
  },
  submit: {
    label: "Agent B: Submit Result + ZK Proof",
    loadingLabel: "Generating ZK Proof (~10s)...",
    visibleOn: ["Accepted"],
  },
  jury: {
    label: "Jury: Commit & Reveal Scores",
    loadingLabel: "Jury Voting...",
    visibleOn: ["ZKPassed", "Deliberating"],
  },
};

export default function DemoControls({ taskId, status }: Props) {
  const [stepStatus, setStepStatus] = useState<Record<Step, StepStatus>>({
    accept: "idle",
    submit: "idle",
    jury: "idle",
  });
  const [error, setError] = useState<string | null>(null);

  const runStep = async (step: Step) => {
    setError(null);
    setStepStatus(s => ({ ...s, [step]: "loading" }));
    try {
      const res = await fetch(`/api/demo/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Request failed");
      setStepStatus(s => ({ ...s, [step]: "done" }));
    } catch (err) {
      setStepStatus(s => ({ ...s, [step]: "error" }));
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const visibleSteps = (Object.entries(STEP_CONFIG) as [Step, typeof STEP_CONFIG[Step]][]).filter(
    ([, cfg]) => cfg.visibleOn.includes(status),
  );

  if (visibleSteps.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {visibleSteps.map(([step, cfg]) => {
        const s = stepStatus[step];
        return (
          <button
            key={step}
            className={`btn btn-sm ${
              step === "accept" ? "btn-accent" : step === "submit" ? "btn-primary" : "btn-warning"
            } ${s === "loading" ? "loading" : ""} ${s === "done" ? "btn-disabled opacity-60" : ""}`}
            onClick={() => runStep(step)}
            disabled={s === "loading" || s === "done"}
          >
            {s === "done" ? "✓ Done" : s === "loading" ? cfg.loadingLabel : cfg.label}
          </button>
        );
      })}
      {error && (
        <span className="text-error text-xs max-w-xs truncate" title={error}>
          Error: {error}
        </span>
      )}
    </div>
  );
}
