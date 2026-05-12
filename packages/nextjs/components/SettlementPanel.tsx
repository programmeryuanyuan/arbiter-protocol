import { formatEther } from "viem";

interface Props {
  taskLoading: boolean;
  taskData: any;
  statusName: string;
  avgScore: string;
}

const formatDeadline = (timestamp: bigint | undefined) => {
  if (!timestamp) return "--";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
};

const formatEscrow = (wei: bigint | undefined) => {
  if (!wei) return "0";
  return parseFloat(formatEther(wei)).toFixed(4);
};

const shortenAddress = (addr: string | undefined) => {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export default function SettlementPanel({ taskLoading, taskData, statusName, avgScore }: Props) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300">
      <div className="card-body">
        <h2 className="card-title text-lg flex items-center gap-2">
          <span className="text-xl">💰</span> Settlement
        </h2>
        <div className="divider my-2"></div>

        {taskLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md"></span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
              <div className="text-base-content/60">Payer</div>
              <div className="font-mono text-right">{shortenAddress(taskData?.payer)}</div>
              <div className="text-base-content/60">Worker</div>
              <div className="font-mono text-right">{shortenAddress(taskData?.worker)}</div>
              <div className="text-base-content/60">Deadline</div>
              <div className="text-right">{formatDeadline(taskData?.deadline)}</div>
              <div className="text-base-content/60">Escrow</div>
              <div className="font-bold text-accent text-right">{formatEscrow(taskData?.escrow)} MON</div>
            </div>

            {statusName === "Resolved" ? (
              <div className="space-y-3 pt-3 border-t border-base-300">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-base-content/60">Final Score</span>
                  <span className="text-2xl font-bold text-success">{avgScore}/100</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-base-content/60">Min Score</span>
                  <span className="font-medium">{taskData ? Number(taskData.minScore) : "--"}/100</span>
                </div>
                <div className="divider my-1"></div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatEscrow(taskData?.escrow)} MON</span>
                  </div>
                  <span className="text-2xl">→</span>
                  <div className="flex items-center gap-2">
                    {taskData && Number(avgScore) >= Number(taskData.minScore) ? (
                      <>
                        <span className="badge badge-success badge-lg">Agent B</span>
                        <span className="text-success text-lg">✅</span>
                      </>
                    ) : (
                      <>
                        <span className="badge badge-error badge-lg">Agent A</span>
                        <span className="text-error text-lg">↩️</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 pt-6 border-t border-base-300">
                <span className="text-4xl">⏳</span>
                <p className="text-base-content/60 mt-2">Awaiting jury deliberation...</p>
                <p className="text-xs text-base-content/40 mt-1">
                  Settlement will trigger automatically after all jury reveals
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
