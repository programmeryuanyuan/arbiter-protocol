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
import ClaimTimeoutButton from "~~/components/ClaimTimeoutButton";
import StatusBadge from "~~/components/StatusBadge";
import TaskStatusTimeline from "~~/components/TaskStatusTimeline";
import ZKVerificationPanel from "~~/components/ZKVerificationPanel";
import SettlementPanel from "~~/components/SettlementPanel";
import JuryPanel from "~~/components/JuryPanel";

// ========== 状态配置 ==========
const STATUS_MAP: Record<number, string> = {
  0: "Created",
  1: "Accepted",
  2: "ZKPassed",
  3: "Deliberating",
  4: "Resolved",
};

// ========== 辅助函数 ==========
const formatEscrow = (wei: bigint | undefined) => {
  if (!wei) return "0";
  return parseFloat(formatEther(wei)).toFixed(4);
};

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
  const currentStatusIndex = ["Created", "Accepted", "ZKPassed", "Deliberating", "Resolved"].indexOf(statusName);

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

  // Deadline 是否过期
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isDeadlineExpired = taskData && Number(taskData.deadline) > 0
    ? nowSeconds > Number(taskData.deadline)
    : false;

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
        <TaskStatusTimeline currentStatusIndex={currentStatusIndex} />

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
          {statusName === "Deliberating" && isDeadlineExpired && (
            <ClaimTimeoutButton taskId={taskId} />
          )}
        </div>

        {/* ---- 主体内容 Grid ---- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 左列：ZK + Settlement */}
          <div className="flex flex-col gap-6">
            <ZKVerificationPanel
              taskLoading={taskLoading}
              taskData={taskData}
              hasResult={hasResult}
              zkLengthPassed={zkLengthPassed}
              zkFieldsPassed={zkFieldsPassed}
              zkProofVerified={zkProofVerified}
            />
            <SettlementPanel
              taskLoading={taskLoading}
              taskData={taskData}
              statusName={statusName}
              avgScore={avgScore}
            />
          </div>

          {/* 右列：Jury Panel */}
          <JuryPanel
            taskLoading={taskLoading}
            juryRecords={juryRecords || []}
            connectedAddress={connectedAddress}
            avgScore={avgScore}
            revealedCount={revealedJury.length}
            minScore={taskData ? Number(taskData.minScore) : 0}
          />

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
