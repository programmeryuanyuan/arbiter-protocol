/**
 * Demo 主脚本 - 端到端演示完整 Arbiter Protocol 流程
 *
 * 流程:
 *   1. 注册 3 个 Jury Agent（质押保证金）
 *   2. Agent A 创建任务（锁定 Escrow）
 *   3. Agent B 查看及格线 → 接单
 *   4. Agent B 执行任务 → IPFS 上传 → ZK Proof 提交
 *   5. 3 个 Jury Commit-Reveal 评分
 *   6. 合约自动结算
 *
 * 用法: node scripts/demo.js
 * 环境变量:
 *   RPC_URL          - RPC 地址 (默认 localhost:8545)
 *   ESCROW_ADDRESS   - ArbiterEscrow 合约地址
 *   REGISTRY_ADDRESS - JuryRegistry 合约地址
 *
 * Hardhat 本地测试时使用内置账户，无需手动设置私钥
 */

import { createPublicClient, http, formatEther } from "viem";
import { createTask } from "./agent_a.js";
import { reviewAndAccept, executeAndSubmit } from "./agent_b.js";
import { registerMultipleJurors, judgeTask, waitForAllCommits } from "./jury_agent.js";

// ── Hardhat 默认测试账户私钥 ─────────────────────────────────
// 仅用于本地开发，切勿在生产环境使用
const HARDHAT_ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account 0 - Agent A
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account 1 - Agent B
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Account 2 - Jury 1
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Account 3 - Jury 2
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // Account 4 - Jury 3
];

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runDemo() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        Arbiter Protocol - 端到端 Demo           ║");
  console.log("║  ZK 格式门槛 + Commit-Reveal Jury + Escrow 结算 ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const publicClient = createPublicClient({ transport: http(RPC_URL) });

  // ── 设置环境变量 ────────────────────────────────────────────
  process.env.RPC_URL = RPC_URL;
  // ESCROW_ADDRESS 和 REGISTRY_ADDRESS 需要提前部署后设置

  const startTime = Date.now();

  // ══════════════════════════════════════════════════════════
  // Step 0: 注册 3 个 Jury
  // ══════════════════════════════════════════════════════════
  console.log("\n── Step 0: 注册 Jury Agent ──────────────────────");
  const juryKeys = HARDHAT_ACCOUNTS.slice(2, 5);
  await registerMultipleJurors(juryKeys);
  console.log("✅ 3 个 Jury 注册完成，各质押 0.01 ETH\n");

  // ══════════════════════════════════════════════════════════
  // Step 1: Agent A 创建任务
  // ══════════════════════════════════════════════════════════
  console.log("── Step 1: Agent A 创建任务 ─────────────────────");
  process.env.PRIVATE_KEY = HARDHAT_ACCOUNTS[0];

  // Agent B 地址 (Account 1)
  const agentBAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const taskId = await createTask({
    workerAddress: agentBAddress,
    minLength: 500,
    minFieldCount: 3,
    requiredFields: ["竞品数量", "核心差异", "市场规模"],
    subjectiveCriteria: "分析深度、逻辑清晰度、数据支撑",
    minScore: 70,
    juryCount: 3,
    deadlineSeconds: 3600,
    escrowAmount: "0.05",
  });
  console.log(`✅ 任务 #${taskId} 创建完成，0.05 ETH 已锁定\n`);

  // ══════════════════════════════════════════════════════════
  // Step 2: Agent B 查看及格线 → 接单
  // ══════════════════════════════════════════════════════════
  console.log("── Step 2: Agent B 查看及格线并接单 ─────────────");
  process.env.PRIVATE_KEY = HARDHAT_ACCOUNTS[1];

  const { accepted, task } = await reviewAndAccept(taskId);
  if (!accepted) {
    console.log("❌ Agent B 拒绝接单，Demo 结束");
    return;
  }
  console.log(`✅ Agent B 已接单，及格线 ${task.minScore}/100\n`);

  // ══════════════════════════════════════════════════════════
  // Step 3: Agent B 执行 + ZK Proof 提交
  // ══════════════════════════════════════════════════════════
  console.log("── Step 3: Agent B 执行任务 + ZK Proof ─────────");
  const { resultURI, commitment } = await executeAndSubmit(taskId, task);
  console.log(`✅ ZK Proof 通过（格式合规），结果: ${resultURI}\n`);

  // ══════════════════════════════════════════════════════════
  // Step 4: Jury Commit-Reveal 评分
  // ══════════════════════════════════════════════════════════
  console.log("── Step 4: Jury Commit 阶段 ────────────────────");

  // 4a. 所有 Jury 并发 commit
  const juryResults = await Promise.all(
    juryKeys.map((key) => {
      process.env.PRIVATE_KEY = key;
      return judgeTask(taskId, key);
    })
  );
  console.log("✅ 所有 Jury commit 完成\n");

  // 4b. 等待确认全部 commit
  await waitForAllCommits(taskId, 3);

  // 4c. 所有 Jury 并发 reveal
  console.log("── Step 5: Jury Reveal 阶段 ────────────────────");
  await Promise.all(juryResults.map((jr) => jr.reveal()));

  // 打印评分
  console.log("\n  Jury 评分汇总:");
  juryResults.forEach((jr, i) => {
    console.log(`    Jury #${i + 1} (${jr.jurorAddr.slice(0, 8)}): ${jr.score}/100`);
  });
  const avgScore = juryResults.reduce((sum, jr) => sum + jr.score, 0) / juryResults.length;
  console.log(`    平均分: ${avgScore.toFixed(1)}/100`);
  console.log(`✅ 所有 Jury reveal 完成\n`);

  // ══════════════════════════════════════════════════════════
  // Step 6: 查看结算结果
  // ══════════════════════════════════════════════════════════
  console.log("── Step 6: 结算结果 ────────────────────────────");
  const finalTask = await publicClient.readContract({
    address: process.env.ESCROW_ADDRESS,
    abi: (await import("./abi/ArbiterEscrow.json", { assert: { type: "json" } })).abi,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const statusNames = ["Created", "Accepted", "ZKPassed", "Deliberating", "Resolved"];
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`  状态: ${statusNames[finalTask.status]}`);
  console.log(`  平均分: ${avgScore.toFixed(1)} / 及格线: ${finalTask.minScore}`);
  console.log(`  结算: ${avgScore >= Number(finalTask.minScore) ? "✅ Agent B 获得 0.05 ETH" : "❌ 退款 Agent A"}`);
  console.log(`  耗时: ${elapsed}s`);

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║              Demo 完成！                        ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

runDemo().catch(console.error);
