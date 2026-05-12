const STATUS_STEPS = [
  { key: "Created", label: "Created", time: "0:00" },
  { key: "Accepted", label: "Accepted", time: "0:12" },
  { key: "ZKPassed", label: "ZK Passed", time: "0:43" },
  { key: "Deliberating", label: "Jury", time: "0:51" },
  { key: "Resolved", label: "Done", time: "--" },
];

interface Props {
  currentStatusIndex: number;
}

export default function TaskStatusTimeline({ currentStatusIndex }: Props) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300 mb-6">
      <div className="card-body">
        <h2 className="card-title text-lg mb-4">Task Status Flow</h2>
        <ul className="steps steps-horizontal w-full">
          {STATUS_STEPS.map((step, idx) => {
            const isCompleted = idx < currentStatusIndex;
            const isCurrent = idx === currentStatusIndex;
            return (
              <li
                key={step.key}
                className={`step ${isCompleted || isCurrent ? "step-primary" : ""}`}
                data-content={isCompleted ? "✓" : isCurrent ? "●" : ""}
              >
                <div className="text-xs mt-1 font-medium">{step.label}</div>
                <div className="text-xs text-base-content/50">{step.time}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
