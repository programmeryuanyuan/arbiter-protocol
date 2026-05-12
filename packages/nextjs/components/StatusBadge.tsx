const STATUS_COLORS: Record<string, string> = {
  Created: "neutral",
  Accepted: "primary",
  ZKPassed: "accent",
  Deliberating: "warning",
  Resolved: "success",
};

export default function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "neutral";
  return <span className={`badge badge-${color} badge-lg font-semibold`}>{status}</span>;
}
