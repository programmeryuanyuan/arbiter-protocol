/**
 * Agent B - 执行者：查看及格线 → 接单 → 执行任务 → IPFS 上传 → ZK Proof 提交
 *
 * 用法: node scripts/agent_b.js
 * 环境变量:
 *   PRIVATE_KEY     - Agent B 的私钥
 *   RPC_URL         - Monad Testnet RPC
 *   ESCROW_ADDRESS  - ArbiterEscrow 合约地址
 *   OPENAI_API_KEY  - LLM API（可选，Demo 可用 mock）
 */

import { createWalletClient, createPublicClient, http, keccak256, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { groth16 } from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { abi } from "./abi/ArbiterEscrow.json" assert { type: "json" };

// ── 配置 ──────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL);

const walletClient = createWalletClient({ account, transport });
const publicClient = createPublicClient({ transport });

// ── 文本 → 数值哈希（用于 ZK 电路输入）─────────────────────────
function hashText(text) {
  const hex = keccak256(toBytes(text));
  // 取前 31 字节，确保在 BN254 素数域内
  return BigInt("0x" + hex.slice(2, 64)) >> 8n;
}

// ── 统计必填字段数量 ──────────────────────────────────────────
function countRequiredFields(text, fieldNames) {
  let count = 0;
  for (const field of fieldNames) {
    if (text.includes(field)) count++;
  }
  return count;
}

// ── 模拟 LLM 生成结果（Demo 用）──────────────────────────────
async function callLLM(prompt) {
  // Demo: 返回模拟的市场分析报告
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
AI Agent 协作市场预计 2026 年达到 $50B，其中 Agent-to-Agent 交易结算
占比约 15%，即 $7.5B。去中心化仲裁需求正在快速增长。

## 数据支撑
- Agent 任务失败率当前约 30-40%（缺乏质量保证）
- 引入 ZK+Jury 机制后预计可降低至 5% 以下
- Monad 并行 EVM 使 ZK 验证成本降低 99%（$10+ → <$0.01）

## 结论
Arbiter Protocol 在 ZK 客观验证 + 主观 Jury 裁决的双层架构上具有独特优势，
特别是在 Monad 低成本并行执行环境下首次实现经济可行。`;
}

// ── 模拟 IPFS 上传（Demo 用）──────────────────────────────────
async function uploadToIPFS(content) {
  // Demo: 用内容哈希模拟 CID
  const hash = keccak256(toBytes(content));
  const mockCID = "Qm" + hash.slice(2, 48);
  console.log(`[Agent B] 结果已上传 IPFS: ${mockCID}`);
  return mockCID;
}

// ── Step 1: 查看及格线，决定是否接单 ──────────────────────────
export async function reviewAndAccept(taskId) {
  const task = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  console.log(`[Agent B] 查看任务 #${taskId}`);
  console.log(`  及格线: ${task.minScore}/100`);
  console.log(`  Escrow: ${task.escrow} wei`);
  console.log(`  客观标准: minLength=${task.objective.minLength}, minFields=${task.objective.minFieldCount}`);

  // Agent B 自主判断是否接单
  if (task.minScore <= 85n) {
    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi,
      functionName: "acceptTask",
      args: [BigInt(taskId)],
      gas: 100_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Agent B] 已接单 taskId: ${taskId}`);
    return { accepted: true, task };
  }

  console.log(`[Agent B] 及格线过高 (${task.minScore}/100)，放弃`);
  return { accepted: false, task };
}

// ── Step 2: 执行任务 + 生成 ZK Proof + 提交 ──────────────────
export async function executeAndSubmit(taskId, task) {
  console.log(`[Agent B] 开始执行任务 #${taskId}...`);

  // 1. LLM 生成结果
  const result = await callLLM(task.subjectiveCriteria);
  console.log(`[Agent B] LLM 生成结果: ${result.length} 字符`);

  // 2. 上传 IPFS
  const resultURI = await uploadToIPFS(result);

  // 3. 计算 ZK witness
  const poseidon = await buildPoseidon();
  const contentHash = hashText(result);
  const commitment = poseidon.F.toString(poseidon([contentHash]));

  const requiredFields = ["竞品数量", "核心差异", "市场规模"];
  const fieldCount = countRequiredFields(result, requiredFields);

  console.log(`[Agent B] ZK 输入:`);
  console.log(`  contentHash: ${contentHash}`);
  console.log(`  commitment: ${commitment}`);
  console.log(`  length: ${result.length}`);
  console.log(`  fieldCount: ${fieldCount}`);

  // 4. 生成 ZK Proof
  let proof, publicSignals;
  try {
    const res = await groth16.fullProve(
      {
        contentHash: contentHash.toString(),
        length: result.length,
        fieldCount: fieldCount,
        minLength: Number(task.objective.minLength),
        minFields: Number(task.objective.minFieldCount),
        commitment: commitment,
      },
      "circuits/result_verifier_js/result_verifier.wasm",
      "circuits/circuit_final.zkey"
    );
    proof = res.proof;
    publicSignals = res.publicSignals;
    console.log("[Agent B] ZK Proof 生成成功");
  } catch (e) {
    // Demo fallback: 用 MockVerifier 时跳过真实 proof
    console.log("[Agent B] ZK Proof 生成跳过（MockVerifier 模式）");
    proof = {
      pi_a: ["0", "0", "1"],
      pi_b: [["0", "0"], ["0", "0"], ["1", "0"]],
      pi_c: ["0", "0", "1"],
    };
    publicSignals = [
      task.objective.minLength.toString(),
      task.objective.minFieldCount.toString(),
      commitment,
    ];
  }

  // 5. 格式化 proof 为合约入参
  const proofA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const proofB = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const proofC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  // 6. 提交链上
  const commitmentBytes32 = toHex(BigInt(commitment), { size: 32 });

  // Monad precompile pricing: ecMul 5x (6k→30k), ecPairing 5x (45k→225k).
  // Cold SLOAD also 3-4x vs Ethereum. Monad charges gas_limit, not gas_used — keep tight.
  const hash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "submitResult",
    args: [
      BigInt(taskId),
      commitmentBytes32,
      resultURI,
      proofA,
      proofB,
      proofC,
      publicSignals.map(BigInt),
    ],
    gas: 1_500_000n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[Agent B] ZK Proof 提交成功, tx: ${receipt.transactionHash}`);

  return { resultURI, commitment };
}

// ── 直接运行 ──────────────────────────────────────────────────
const TASK_ID = process.env.TASK_ID;

if (TASK_ID) {
  (async () => {
    const { accepted, task } = await reviewAndAccept(TASK_ID);
    if (accepted) {
      await executeAndSubmit(TASK_ID, task);
    }
  })().catch(console.error);
}
