"use client";

import { useAccount } from "wagmi";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

// ========== Mock 数据（第一阶段用假数据填充骨架）==========
const MOCK_TASK = {
  id: 42,
  status: "Deliberating" as const, // Created | Accepted | ZKPassed | Deliberating | Resolved
  payer: "0xA71d5F36cD0C5B1234d4b5C6d7E8F9a0B1c2D3e4",
  worker: "0xB82e6F47D1E2F3456G7h8I9j0K1l2M3n4O5p6Q7",
  escrow: "0.05",
  minScore: 70,
  deadline: "2024-05-12 18:00",
};

const MOCK_ZK = {
  minLength: 500,
  actualLength: 847,
  lengthPassed: true,
  minFields: 3,
  actualFields: 3,
  fieldsPassed: true,
  proofVerified: true,
  resultURI: "ipfs://QmXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890AbCd",
};

const MOCK_JURY = [
  { id: 1, address: "0xJ1...a3b4", committed: true, revealed: true, score: 82 },
  { id: 2, address: "0xJ2...c5d6", committed: true, revealed: true, score: 79 },
  { id: 3, address: "0xJ3...e7f8", committed: true, revealed: false, score: null },
];

const MOCK_PERFORMANCE = {
  zkGas: "$0.008",
  parallelJury: true,
  settlementTime: "~0.4s",
  blockNumber: 8847362,
};

// ========== 状态配置 ==========
const STATUS_STEPS = [
  { key: "Created", label: "Created", time: "0:00" },
  { key: "Accepted", label: "Accepted", time: "0:12" },
  { key: "ZKPassed", label: "ZK Passed", time: "0:43" },
  { key: "Deliberating", label: "Jury", time: "0:51" },
  { key: "Resolved", label: "Done", time: "--" },
];

const STATUS_COLORS: Record<string, string> = {
  Created: "neutral",
  Accepted: "primary",
  ZKPassed: "accent",
  Deliberating: "warning",
  Resolved: "success",
};

// ========== 辅助组件 ==========
const StatusBadge = ({ status }: { status: string }) => {
  const color = STATUS_COLORS[status] || "neutral";
  return <span className={`badge badge-${color} badge-lg font-semibold`}>{status}</span>;
};

const CheckItem = ({ label, passed }: { label: string; passed: boolean }) => (
  <div className="flex items-center gap-2 py-1">
    <span className={`text-lg ${passed ? "text-success" : "text-error"}`}>
      {passed ? "✅" : "❌"}
    </span>
    <span className="text-sm">{label}</span>
  </div>
);

// ========== 主页面 ==========
const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  const currentStatusIndex = STATUS_STEPS.findIndex(s => s.key === MOCK_TASK.status);
  const revealedJury = MOCK_JURY.filter(j => j.revealed);
  const avgScore = revealedJury.length > 0
    ? (revealedJury.reduce((sum, j) => sum + (j.score || 0), 0) / revealedJury.length).toFixed(1)
    : "--";

  return (
    <div className="flex flex-col min-h-screen">
      {/* ===== 顶部标题栏 ===== */}
      <div className="bg-base-200 border-b border-base-300">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Arbiter Protocol</h1>
              <p className="text-sm text-base-content/60 mt-1">
                Decentralized Arbitration for Agent Work · Monad Testnet
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base-content/60">Block:</span>
                <span className="font-mono font-bold">#{MOCK_PERFORMANCE.blockNumber.toLocaleString()}</span>
              </div>
              {connectedAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/50">Connected:</span>
                  <Address address={connectedAddress} chain={targetNetwork} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 主内容区 ===== */}
      <div className="container mx-auto px-4 py-6 flex-1">

        {/* ---- 任务信息条 ---- */}
        <div className="card bg-base-100 shadow-sm border border-base-300 mb-6">
          <div className="card-body py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Task ID:</span>
                <span className="font-mono font-bold text-lg">#{MOCK_TASK.id}</span>
              </div>
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <StatusBadge status={MOCK_TASK.status} />
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Escrow:</span>
                <span className="font-bold text-accent">{MOCK_TASK.escrow} MON</span>
              </div>
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Min Score:</span>
                <span className="font-bold">{MOCK_TASK.minScore}/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- 任务状态时间轴 ---- */}
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

        {/* ---- 主体内容 Grid ---- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 左列：ZK + Settlement */}
          <div className="flex flex-col gap-6">

            {/* ZK 验证面板 */}
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg flex items-center gap-2">
                  <span className="text-xl">🔐</span> ZK Verification
                </h2>
                <div className="divider my-2"></div>
                <CheckItem
                  label={`Length: ${MOCK_ZK.actualLength} chars ≥ min ${MOCK_ZK.minLength}`}
                  passed={MOCK_ZK.lengthPassed}
                />
                <CheckItem
                  label={`Fields: ${MOCK_ZK.actualFields}/${MOCK_ZK.minFields} required`}
                  passed={MOCK_ZK.fieldsPassed}
                />
                <CheckItem
                  label="ZK Proof verified on-chain"
                  passed={MOCK_ZK.proofVerified}
                />
                <div className="mt-3 p-3 bg-base-200 rounded-lg">
                  <div className="text-xs text-base-content/60 mb-1">Result IPFS:</div>
                  <a
                    href={`https://ipfs.io/ipfs/${MOCK_ZK.resultURI.replace("ipfs://", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-info hover:underline text-xs font-mono break-all"
                  >
                    {MOCK_ZK.resultURI}
                  </a>
                </div>
              </div>
            </div>

            {/* 结算结果面板 */}
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg flex items-center gap-2">
                  <span className="text-xl">💰</span> Settlement
                </h2>
                <div className="divider my-2"></div>

                {/* 任务基本信息 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
                  <div className="text-base-content/60">Payer</div>
                  <div className="font-mono text-right">{MOCK_TASK.payer.slice(0, 6)}...{MOCK_TASK.payer.slice(-4)}</div>
                  <div className="text-base-content/60">Worker</div>
                  <div className="font-mono text-right">{MOCK_TASK.worker.slice(0, 6)}...{MOCK_TASK.worker.slice(-4)}</div>
                  <div className="text-base-content/60">Deadline</div>
                  <div className="text-right">{MOCK_TASK.deadline}</div>
                  <div className="text-base-content/60">Escrow</div>
                  <div className="font-bold text-accent text-right">{MOCK_TASK.escrow} MON</div>
                </div>

                {MOCK_TASK.status === "Resolved" ? (
                  <div className="space-y-3 pt-3 border-t border-base-300">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-base-content/60">Final Score</span>
                      <span className="text-2xl font-bold text-success">{avgScore}/100</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-base-content/60">Min Score</span>
                      <span className="font-medium">{MOCK_TASK.minScore}/100</span>
                    </div>
                    <div className="divider my-1"></div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{MOCK_TASK.escrow} MON</span>
                      </div>
                      <span className="text-2xl">→</span>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-success badge-lg">Agent B</span>
                        <span className="text-success text-lg">✅</span>
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
              </div>
            </div>

          </div>

          {/* 右列：Jury Panel */}
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-lg flex items-center gap-2">
                <span className="text-xl">⚖️</span> Jury Deliberation
              </h2>
              <div className="divider my-2"></div>

              {/* Jury 列表 */}
              <div className="space-y-3 flex-1">
                {MOCK_JURY.map(jury => (
                  <div key={jury.id} className="p-3 bg-base-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">Jury #{jury.id}</span>
                        <span className="text-xs text-base-content/50">{jury.address}</span>
                      </div>
                      {jury.revealed && jury.score !== null && (
                        <span className="text-xl font-bold text-primary">{jury.score}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <span className={`badge badge-sm ${jury.committed ? "badge-success" : "badge-ghost"}`}>
                          C{jury.committed ? "✓" : "○"}
                        </span>
                        <span className="text-xs text-base-content/50">Commit</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`badge badge-sm ${jury.revealed ? "badge-success" : "badge-outline badge-warning"}`}>
                          R{jury.revealed ? "✓" : "○"}
                        </span>
                        <span className="text-xs text-base-content/50">Reveal</span>
                      </div>
                      {!jury.revealed && (
                        <span className="text-xs text-warning ml-auto">Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 平均分 */}
              <div className="divider my-3"></div>
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                <span className="font-medium">Average Score</span>
                <span className="text-2xl font-bold text-primary">{avgScore}</span>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-xs text-base-content/60">
                  {revealedJury.length}/{MOCK_JURY.length} revealed
                </span>
                <span className="text-xs text-base-content/60">
                  Min: {MOCK_TASK.minScore}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ---- 底部性能指标 ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">⛽</div>
              <div className="text-sm text-base-content/60">ZK Verify Gas</div>
              <div className="text-xl font-bold text-success">{MOCK_PERFORMANCE.zkGas}</div>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">🚀</div>
              <div className="text-sm text-base-content/60">Parallel Jury</div>
              <div className={`text-xl font-bold ${MOCK_PERFORMANCE.parallelJury ? "text-success" : "text-error"}`}>
                {MOCK_PERFORMANCE.parallelJury ? "✓ Concurrent" : "✗ Sequential"}
              </div>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">⚡</div>
              <div className="text-sm text-base-content/60">Settlement Time</div>
              <div className="text-xl font-bold text-primary">{MOCK_PERFORMANCE.settlementTime}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
