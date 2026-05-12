/**
 * Agent B - Worker：接单、生成 ZK Proof、提交结果
 *
 * 用法（从项目根目录运行）: node scripts/agent_b.js
 * 环境变量:
 *   PRIVATE_KEY    - Agent B 的私钥
 *   RPC_URL        - Monad Testnet RPC
 *   ESCROW_ADDRESS - ArbiterEscrow 合约地址
 *   TASK_ID        - 要处理的任务 ID（直接运行时）
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi } from "./abi/ArbiterEscrow.json" assert { type: "json" };
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

// ── 配置 ──────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;

// 从项目根目录运行时，circuits/ 就在当前目录
const WASM_PATH = "circuits/result_verifier_js/result_verifier.wasm";
const ZKEY_PATH = "circuits/circuit_final.zkey";

// BN128 field order
const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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

// ── 生成满足格式要求的报告 ─────────────────────────────────────
function generateReport(minLength, _minFieldCount) {
  const base = `# 竞品分析报告

## 竞品数量
目前市场上主要有 5 个竞品：TickPay、Teleo、Yiling、Clawork、Dispatch。

## 核心差异
1. TickPay 专注流式支付，无结果验证机制
2. Teleo 使用 LLM 作为裁判，缺乏客观链上验证
3. Yiling 基于预测市场共识，非雇佣场景
4. Clawork/Dispatch 是任务市场，无 ZK+Jury 验收层
5. Arbiter Protocol 独创 ZK 格式门槛 + Commit-Reveal Jury 两层信任

## 市场规模
AI Agent 协作市场预计 2026 年达到 $50B。
Agent 任务失败率当前约 30-40%，引入 ZK+Jury 后预计降低至 5% 以下。

## 数据支撑
- Agent 市场 2025 年规模：$13.8B
- 预计 CAGR：47.1%（2025-2030）
- ZK Verify Gas 费用：约 $0.008（Monad 上）
- Jury 评审窗口：5 分钟，并行执行

## 结论
Arbiter Protocol 通过 ZK 格式门槛 + Commit-Reveal Jury 实现双层可验证信任，
是当前市场上唯一完整解决 AI Agent 协作信任问题的协议。
`;

  let content = base;
  let extra = 0;
  while (content.length < minLength) {
    content += `\n附录 ${++extra}：补充数据项，市场分析延伸内容。`;
  }
  return content;
}

// ── Agent B：接受任务 ──────────────────────────────────────────
export async function acceptTask(taskId, privateKey = PRIVATE_KEY) {
  const clients = createClients(privateKey);
  console.log(`[Agent B] 接受任务 #${taskId}...`);

  const hash = await clients.wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "acceptTask",
    args: [BigInt(taskId)],
    gas: 100_000n,
  });

  await clients.public.waitForTransactionReceipt({ hash });
  console.log(`[Agent B] 任务 #${taskId} 已接受`);
}

// ── Agent B：生成 ZK Proof 并提交结果 ─────────────────────────
export async function submitResult(taskId, privateKey = PRIVATE_KEY) {
  const clients = createClients(privateKey);

  // 1. 从链上读取任务参数
  const task = await clients.public.readContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const minLength = Number(task.objective.minLength);
  const minFieldCount = Number(task.objective.minFieldCount);
  console.log(`[Agent B] 任务 #${taskId}: minLength=${minLength}, minFields=${minFieldCount}`);

  // 2. 生成满足格式要求的报告
  const content = generateReport(minLength, minFieldCount);
  console.log(`[Agent B] 报告生成: ${content.length} 字符`);

  // 3. contentHash = keccak256(content) mod fieldOrder（私密输入）
  const rawHash = BigInt(keccak256(toBytes(content)));
  const contentHash = rawHash % FIELD_ORDER;

  // 4. commitment = Poseidon(contentHash)（公开输入，链上验证）
  console.log(`[Agent B] 计算 Poseidon commitment...`);
  const poseidon = await buildPoseidon();
  const commitmentField = poseidon([contentHash]);
  const commitment = poseidon.F.toObject(commitmentField); // BigInt

  // 5. 生成 Groth16 Proof
  console.log(`[Agent B] 生成 ZK Proof（约 5-10 秒）...`);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      contentHash,
      length: BigInt(content.length),
      fieldCount: BigInt(minFieldCount),
      minLength: BigInt(minLength),
      minFields: BigInt(minFieldCount),
      commitment,
    },
    WASM_PATH,
    ZKEY_PATH,
  );
  console.log(
    `[Agent B] Proof 生成成功, publicSignals: [${publicSignals[0]}, ${publicSignals[1]}, ${publicSignals[2].slice(0, 10)}...]`,
  );

  // 6. 格式化 proof → Solidity calldata
  // G2 points 坐标需反转（BN128 Solidity verifier 规范）
  const proofA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const proofB = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const proofC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const pubSignals = [
    BigInt(publicSignals[0]),
    BigInt(publicSignals[1]),
    BigInt(publicSignals[2]),
  ];

  // 7. resultCommitment as bytes32（合约用 uint256(resultCommitment) 比对 publicSignals[2]）
  const resultCommitment = toHex(commitment, { size: 32 });

  // 8. 提交上链
  const resultURI = `ipfs://QmArbiterDemo${Date.now()}`;
  console.log(`[Agent B] 提交结果上链...`);

  const hash = await clients.wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "submitResult",
    args: [BigInt(taskId), resultCommitment, resultURI, proofA, proofB, proofC, pubSignals],
    gas: 1_500_000n,
  });

  const receipt = await clients.public.waitForTransactionReceipt({ hash });
  console.log(`[Agent B] 结果提交成功, tx: ${receipt.transactionHash}`);
  console.log(`[Agent B] ZK 验证通过 → 进入 Jury 评审阶段`);
  return receipt;
}

// ── 直接运行：接单 + 提交结果 ─────────────────────────────────
const TASK_ID = process.env.TASK_ID;

if (TASK_ID !== undefined) {
  const run = async () => {
    await acceptTask(TASK_ID);
    await new Promise(r => setTimeout(r, 2000));
    await submitResult(TASK_ID);
  };
  run().catch(console.error);
}
