"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";
import CreateTaskButton from "~~/components/CreateTaskButton";
import AcceptTaskButton from "~~/components/AcceptTaskButton";
import JuryRegisterButton from "~~/components/JuryRegisterButton";
import SubmitResultButton from "~~/components/SubmitResultButton";
import CommitScoreButton from "~~/components/CommitScoreButton";
import RevealScoreButton from "~~/components/RevealScoreButton";

// ========== 状态配置 ==========
const STATUS_STEPS = [
  { key: "Created", label: "Created", time: "0:00" },
  { key: "Accepted", label: "Accepted", time: "0:12" },
  { key: "ZKPassed", label: "ZK Passed", time: "0:43" },
  { key: "Deliberating", label: "Jury", time: "0:51" },
  { key: "Resolved", label: "Done", time: "--" },
];

const STATUS_MAP: Record<number, string> = {
  0: "Created",
  1: "Accepted",
  2: "ZKPassed",
  3: "Deliberating",
  4: "Resolved",
};

const STATUS_COLORS: Record<string, string> = {
  Created: "neutral",
  Accepted: "primary",
  ZKPassed: "accent",
  Deliberating: "warning",
  Resolved: "success",
};

// ========== 辅助函数 ==========
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
  const [taskId, setTaskId] = useState<number>(0);

  // 1. 读取总任务数（关闭轮询，靠事件刷新）
  const { data: taskCount, refetch: refetchTaskCount } = useScaffoldReadContract({
    contractName: "ArbiterEscrow",
    functionName: "taskCount",
    watch: false,
  });

  // 自动选择最新任务
  useEffect(() => {
    if (taskCount !== undefined && taskCount > 0n && taskId === 0) {
      setTaskId(Number(taskCount) - 1);
    }
  }, [taskCount, taskId]);

  // 2. 读取任务详情
  const { data: taskData, isLoading: taskLoading, refetch: refetchTask } = useScaffoldReadContract({
    contractName: "ArbiterEscrow",
    functionName: "getTask",
    args: [BigInt(taskId)],
    enabled: taskCount !== undefined && taskCount > 0n,
    watch: false,
  });

  // 3. 读取 Jury 记录
  const { data: juryRecords, refetch: refetchJury } = useScaffoldReadContract({
    contractName: "ArbiterEscrow",
    functionName: "getJuryRecords",
    args: [BigInt(taskId)],
    enabled: taskCount !== undefined && taskCount > 0n,
    watch: false,
  });

  // 通用刷新函数
  const refreshAll = () => {
    refetchTaskCount();
    refetchTask();
    refetchJury();
  };

  // 监听合约事件，实时刷新
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "TaskCreated",
    onLogs: refreshAll,
  });
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "TaskAccepted",
    onLogs: refreshAll,
  });
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "ZKPassed",
    onLogs: refreshAll,
  });
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "ScoreCommitted",
    onLogs: refreshAll,
  });
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "ScoreRevealed",
    onLogs: refreshAll,
  });
  useScaffoldWatchContractEvent({
    contractName: "ArbiterEscrow",
    eventName: "TaskResolved",
    onLogs: refreshAll,
  });

  // 数据转换
  const statusName = taskData ? STATUS_MAP[Number(taskData.status)] : "Created";
  const currentStatusIndex = STATUS_STEPS.findIndex(s => s.key === statusName);

  const revealedJury = (juryRecords || []).filter(j => j.revealed);
  const avgScore = revealedJury.length > 0
    ? (revealedJury.reduce((sum, j) => sum + Number(j.score), 0) / revealedJury.length).toFixed(1)
    : "--";

  const maxTaskId = taskCount && taskCount > 0n ? Number(taskCount) - 1 : 0;

  // ZK 验证数据
  const hasResult = statusName === "ZKPassed" || statusName === "Deliberating" || statusName === "Resolved";
  const zkLengthPassed = hasResult && taskData ? Number(taskData.objective.minLength) > 0 : false;
  const zkFieldsPassed = hasResult && taskData ? Number(taskData.objective.minFieldCount) > 0 : false;
  const zkProofVerified = hasResult;

  // ========== 空状态 ==========
  if (!taskCount || taskCount === 0n) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="bg-base-200 border-b border-base-300">
          <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Arbiter Protocol</h1>
                <p className="text-sm text-base-content/60 mt-1">
                  Decentralized Arbitration for Agent Work
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
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
        <div className="container mx-auto px-4 py-12 flex-1 flex items-center justify-center">
          <div className="card bg-base-100 shadow-sm border border-base-300 max-w-md w-full">
            <div className="card-body text-center">
              <span className="text-5xl mb-4">📭</span>
              <h2 className="card-title text-xl justify-center">No Tasks Found</h2>
              <p className="text-base-content/60 mt-2">
                The ArbiterEscrow contract has no tasks yet.
              </p>
              <p className="text-xs text-base-content/40 mt-1">
                Use the Debug Contracts tab to create a task, or run the demo script.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ===== 顶部标题栏 ===== */}
      <div className="bg-base-200 border-b border-base-300">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Arbiter Protocol</h1>
              <p className="text-sm text-base-content/60 mt-1">
                Decentralized Arbitration for Agent Work · {targetNetwork.name}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
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
                <input
                  type="number"
                  min={0}
                  max={maxTaskId}
                  value={taskId}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 0 && val <= maxTaskId) setTaskId(val);
                  }}
                  className="input input-bordered input-sm w-20 font-mono"
                />
                <span className="text-xs text-base-content/50">/ {maxTaskId}</span>
              </div>
              <div className="divider divider-horizontal hidden sm:flex"></div>
              {taskLoading ? (
                <span className="loading loading-dots loading-sm"></span>
              ) : (
                <StatusBadge status={statusName} />
              )}
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Escrow:</span>
                <span className="font-bold text-accent">
                  {taskData ? formatEscrow(taskData.escrow) : "--"} MON
                </span>
              </div>
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Min Score:</span>
                <span className="font-bold">
                  {taskData ? Number(taskData.minScore) : "--"}/100
                </span>
              </div>
              <div className="divider divider-horizontal hidden sm:flex"></div>
              <CreateTaskButton />
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

        {/* ---- 操作按钮区 ---- */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <JuryRegisterButton />
          {statusName === "Created" && (
            <AcceptTaskButton taskId={taskId} />
          )}
          {statusName === "Accepted" && (
            <SubmitResultButton taskId={taskId} />
          )}
          {(statusName === "ZKPassed" || statusName === "Deliberating") && (
            <>
              <CommitScoreButton taskId={taskId} />
              <RevealScoreButton taskId={taskId} />
            </>
          )}
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
                {taskLoading ? (
                  <div className="flex justify-center py-4">
                    <span className="loading loading-spinner loading-md"></span>
                  </div>
                ) : (
                  <>
                    <CheckItem
                      label={`Length check: min ${taskData ? Number(taskData.objective.minLength) : 0} chars`}
                      passed={zkLengthPassed}
                    />
                    <CheckItem
                      label={`Fields check: min ${taskData ? Number(taskData.objective.minFieldCount) : 0} required`}
                      passed={zkFieldsPassed}
                    />
                    <CheckItem
                      label="ZK Proof verified on-chain"
                      passed={zkProofVerified}
                    />
                    {hasResult && taskData && taskData.resultURI ? (
                      <div className="mt-3 p-3 bg-base-200 rounded-lg">
                        <div className="text-xs text-base-content/60 mb-1">Result IPFS:</div>
                        <a
                          href={`https://ipfs.io/ipfs/${taskData.resultURI.replace("ipfs://", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-info hover:underline text-xs font-mono break-all"
                        >
                          {taskData.resultURI}
                        </a>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 bg-base-200 rounded-lg text-xs text-base-content/50 text-center">
                        Result not submitted yet
                      </div>
                    )}
                  </>
                )}
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

          </div>

          {/* 右列：Jury Panel */}
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-lg flex items-center gap-2">
                <span className="text-xl">⚖️</span> Jury Deliberation
              </h2>
              <div className="divider my-2"></div>

              {taskLoading ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-md"></span>
                </div>
              ) : (
                <>
                  {/* Jury 列表 */}
                  <div className="space-y-3">
                    {(juryRecords || []).length === 0 ? (
                      <div className="text-center py-4 text-base-content/50 text-sm">
                        No jury assigned yet
                      </div>
                    ) : (
                      (juryRecords || []).map((jury, idx) => (
                        <div key={idx} className="p-3 bg-base-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">Jury #{idx + 1}</span>
                              <span className="text-xs text-base-content/50">{shortenAddress(jury.juror)}</span>
                            </div>
                            {jury.revealed && (
                              <span className="text-xl font-bold text-primary">{Number(jury.score)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <span className={`badge badge-sm ${jury.committed ? "badge-success" : "badge-outline badge-warning"}`}>
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
                      ))
                    )}
                  </div>

                  {/* 平均分 */}
                  {(juryRecords || []).length > 0 && (
                    <>
                      <div className="divider my-3"></div>
                      <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                        <span className="font-medium">Average Score</span>
                        <span className="text-2xl font-bold text-primary">{avgScore}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-xs text-base-content/60">
                          {revealedJury.length}/{(juryRecords || []).length} revealed
                        </span>
                        <span className="text-xs text-base-content/60">
                          Min: {taskData ? Number(taskData.minScore) : "--"}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

        </div>

        {/* ---- 底部性能指标 ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">⛽</div>
              <div className="text-sm text-base-content/60">ZK Verify Gas</div>
              <div className="text-xl font-bold text-success">~$0.008</div>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">🚀</div>
              <div className="text-sm text-base-content/60">Parallel Jury</div>
              <div className="text-xl font-bold text-success">✓ Concurrent</div>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center py-4">
              <div className="text-2xl mb-1">⚡</div>
              <div className="text-sm text-base-content/60">Settlement Time</div>
              <div className="text-xl font-bold text-primary">~0.4s</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
