/**
 * Agent A - 雇主：创建任务，锁定 Escrow
 *
 * 用法: node scripts/agent_a.js
 * 环境变量:
 *   PRIVATE_KEY    - Agent A 的私钥
 *   RPC_URL        - Monad Testnet RPC
 *   ESCROW_ADDRESS - ArbiterEscrow 合约地址
 */

import { createWalletClient, createPublicClient, http, parseEther, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi } from "./abi/ArbiterEscrow.json" assert { type: "json" };

// ── 配置 ──────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL);

const walletClient = createWalletClient({ account, transport });
const publicClient = createPublicClient({ transport });

// ── 创建任务 ──────────────────────────────────────────────────
export async function createTask({
  workerAddress,
  minLength = 500,
  minFieldCount = 3,
  requiredFields = ["竞品数量", "核心差异", "市场规模"],
  subjectiveCriteria = "分析深度、逻辑清晰度、数据支撑",
  minScore = 70,
  juryCount = 3,
  deadlineSeconds = 3600,
  escrowAmount = "0.05",
}) {
  // 字段列表哈希
  const fieldListHash = keccak256(toBytes(JSON.stringify(requiredFields)));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  console.log("[Agent A] 创建任务...");
  console.log(`  Worker: ${workerAddress}`);
  console.log(`  及格线: ${minScore}/100`);
  console.log(`  Escrow: ${escrowAmount} ETH`);
  console.log(`  Jury 数量: ${juryCount}`);
  console.log(`  客观标准: minLength=${minLength}, minFields=${minFieldCount}`);

  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "createTask",
    args: [
      workerAddress,
      {
        minLength: BigInt(minLength),
        minFieldCount: BigInt(minFieldCount),
        fieldListHash,
      },
      subjectiveCriteria,
      BigInt(minScore),
      BigInt(juryCount),
      deadline,
    ],
    value: parseEther(escrowAmount),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[Agent A] 任务创建成功, tx: ${receipt.transactionHash}`);

  // 从事件中提取 taskId
  const taskCreatedLog = receipt.logs.find((log) => {
    try {
      return log.topics[0] === keccak256(toBytes("TaskCreated(uint256,address,address,uint256,uint256)"));
    } catch {
      return false;
    }
  });

  // taskId 是第一个 indexed 参数
  const taskId = taskCreatedLog ? BigInt(taskCreatedLog.topics[1]) : 0n;
  console.log(`[Agent A] taskId: ${taskId}`);

  return taskId;
}

// ── 查询任务状态 ──────────────────────────────────────────────
export async function getTaskStatus(taskId) {
  const task = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const statusNames = ["Created", "Accepted", "ZKPassed", "Deliberating", "Resolved"];
  console.log(`[Agent A] Task #${taskId} 状态: ${statusNames[task.status]}`);
  return task;
}

// ── 超时取回资金 ──────────────────────────────────────────────
export async function claimTimeout(taskId) {
  console.log(`[Agent A] 尝试超时取回资金, taskId: ${taskId}`);

  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "claimTimeout",
    args: [BigInt(taskId)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[Agent A] 超时取回成功, tx: ${receipt.transactionHash}`);
}

// ── 直接运行 ──────────────────────────────────────────────────
const AGENT_B_ADDRESS = process.env.AGENT_B_ADDRESS;

if (AGENT_B_ADDRESS) {
  createTask({ workerAddress: AGENT_B_ADDRESS }).catch(console.error);
}
