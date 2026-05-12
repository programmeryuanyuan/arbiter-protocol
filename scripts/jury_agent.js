/**
 * Jury Agent - 评审：Commit-Reveal 两阶段评分
 *
 * 用法: node scripts/jury_agent.js
 * 环境变量:
 *   PRIVATE_KEY     - Jury 的私钥
 *   RPC_URL         - Monad Testnet RPC
 *   ESCROW_ADDRESS  - ArbiterEscrow 合约地址
 *   REGISTRY_ADDRESS - JuryRegistry 合约地址
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  toBytes,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi as escrowAbi } from "./abi/ArbiterEscrow.json" assert { type: "json" };
import { abi as registryAbi } from "./abi/JuryRegistry.json" assert { type: "json" };
import crypto from "crypto";

// ── 配置 ──────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

// ── 创建客户端 ────────────────────────────────────────────────
function createClients(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(RPC_URL);
  return {
    account,
    wallet: createWalletClient({ account, transport }),
    public: createPublicClient({ transport }),
  };
}

// ── 模拟 IPFS 获取结果 ───────────────────────────────────────
async function fetchFromIPFS(resultURI) {
  // Demo: 返回模拟内容（实际从 IPFS gateway 获取）
  console.log(`[Jury] 从 IPFS 获取结果: ${resultURI}`);
  return `# 竞品分析报告

## 竞品数量
目前市场上主要有 5 个竞品：TickPay、Teleo、Yiling、Clawork、Dispatch。

## 核心差异
1. TickPay 专注流式支付，无结果验证机制
2. Teleo 使用 LLM 作为裁判，缺乏客观验证
3. Yiling 基于预测市场共识，非雇佣场景
4. Clawork/Dispatch 是任务市场，无 ZK+Jury 验收层
5. Arbiter Protocol 独创 ZK 格式门槛 + Commit-Reveal Jury 两层信任

## 市场规模
AI Agent 协作市场预计 2026 年达到 $50B。

## 数据支撑
- Agent 任务失败率当前约 30-40%
- 引入 ZK+Jury 后预计降低至 5% 以下

## 结论
Arbiter Protocol 具有独特优势。`;
}

// ── 模拟 LLM 评分 ────────────────────────────────────────────
async function llmScore(subjectiveCriteria, resultContent) {
  // Demo: 返回 75-90 范围内的随机分数（模拟不同 Jury 的独立判断）
  const base = 75;
  const variance = Math.floor(Math.random() * 16); // 0-15
  const score = base + variance;
  console.log(`[Jury] LLM 评分: ${score}/100`);
  return score;
}

// ── Jury 注册 ─────────────────────────────────────────────────
export async function registerJuror(privateKey, stakeAmount = "0.001") {
  const clients = createClients(privateKey);

  console.log(`[Jury ${clients.account.address.slice(0, 8)}] 注册中...`);

  const hash = await clients.wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "register",
    value: parseEther(stakeAmount),
    gas: 120_000n,
  });

  await clients.public.waitForTransactionReceipt({ hash });
  console.log(`[Jury ${clients.account.address.slice(0, 8)}] 注册成功, stake: ${stakeAmount} MON`);
}

// ── Jury 评审完整流程：Commit → 等待 → Reveal ──────────────────
export async function judgeTask(taskId, privateKey) {
  const clients = createClients(privateKey);
  const jurorAddr = clients.account.address.slice(0, 8);

  // 1. 获取任务信息
  const task = await clients.public.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  console.log(`[Jury ${jurorAddr}] 开始评审任务 #${taskId}`);

  // 2. 从 IPFS 获取结果
  const resultContent = await fetchFromIPFS(task.resultURI);

  // 3. LLM 评分
  const score = await llmScore(task.subjectiveCriteria, resultContent);
  const clampedScore = Math.max(0, Math.min(100, score));

  // 4. Commit 阶段：提交 hash(score, salt)
  const salt = "0x" + crypto.randomBytes(32).toString("hex");
  const scoreHash = keccak256(
    encodePacked(["uint256", "bytes32"], [BigInt(clampedScore), salt])
  );

  console.log(`[Jury ${jurorAddr}] Commit 评分哈希...`);
  const commitHash = await clients.wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "commitScore",
    args: [BigInt(taskId), scoreHash],
    gas: 150_000n,
  });
  await clients.public.waitForTransactionReceipt({ hash: commitHash });
  console.log(`[Jury ${jurorAddr}] Commit 完成`);

  // 5. 返回 reveal 所需数据（等待所有人 commit 后调用 reveal）
  return {
    jurorAddr: clients.account.address,
    score: clampedScore,
    salt,
    reveal: async () => {
      console.log(`[Jury ${jurorAddr}] Reveal 评分: ${clampedScore}/100`);
      const revealHash = await clients.wallet.writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "revealScore",
        args: [BigInt(taskId), BigInt(clampedScore), salt],
        gas: 200_000n,
      });
      await clients.public.waitForTransactionReceipt({ hash: revealHash });
      console.log(`[Jury ${jurorAddr}] Reveal 完成`);
    },
  };
}

// ── 等待所有 Jury commit（轮询 records，无共享计数器依赖）──────
export async function waitForAllCommits(taskId, expectedCount) {
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ transport });

  console.log(`[Jury] 等待所有 ${expectedCount} 个 Jury commit...`);

  while (true) {
    const records = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getJuryRecords",
      args: [BigInt(taskId)],
    });

    const committed = records.filter(r => r.committed).length;
    if (committed >= expectedCount) {
      console.log("[Jury] 所有 Jury 已 commit");
      break;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ── 推进到 reveal 阶段（permissionless 聚合步骤）────────────────
export async function advanceToReveal(taskId, privateKey) {
  const clients = createClients(privateKey);
  console.log(`[Jury] advanceToReveal taskId=${taskId}...`);

  const hash = await clients.wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "advanceToReveal",
    args: [BigInt(taskId)],
    gas: 200_000n,
  });
  await clients.public.waitForTransactionReceipt({ hash });
  console.log("[Jury] reveal 阶段已开启");
}

// ── 等待所有 Jury reveal 并触发结算 ──────────────────────────────
export async function waitAndFinalize(taskId, expectedCount, privateKey) {
  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ transport });

  console.log(`[Jury] 等待所有 ${expectedCount} 个 Jury reveal...`);

  while (true) {
    const records = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getJuryRecords",
      args: [BigInt(taskId)],
    });

    const revealed = records.filter(r => r.revealed).length;
    if (revealed >= expectedCount) {
      console.log("[Jury] 所有 Jury 已 reveal，触发结算...");
      break;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  const clients = createClients(privateKey);
  const hash = await clients.wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "finalizeTask",
    args: [BigInt(taskId)],
    gas: 300_000n,
  });
  await clients.public.waitForTransactionReceipt({ hash });
  console.log("[Jury] 结算完成");
}

// ── 批量注册多个 Jury（Demo 用）──────────────────────────────
export async function registerMultipleJurors(privateKeys) {
  for (const pk of privateKeys) {
    await registerJuror(pk);
    // Monad async execution: 3-block state delay (~1.2s) before next tx from same account
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`[Jury] ${privateKeys.length} 个 Jury 注册完成`);
}
