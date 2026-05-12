import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, keccak256, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

const RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || "0xD7f22e2c4ef4127c4B93e027c041a91E22635679") as `0x${string}`;
const FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const ABI = [
  {
    name: "submitResult",
    type: "function",
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "resultCommitment", type: "bytes32" },
      { name: "resultURI", type: "string" },
      { name: "proofA", type: "uint256[2]" },
      { name: "proofB", type: "uint256[2][2]" },
      { name: "proofC", type: "uint256[2]" },
      { name: "publicSignals", type: "uint256[3]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getTask",
    type: "function",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "payer", type: "address" },
          { name: "worker", type: "address" },
          { name: "escrow", type: "uint256" },
          { name: "objective", type: "tuple", components: [
            { name: "minLength", type: "uint256" },
            { name: "minFieldCount", type: "uint256" },
            { name: "fieldListHash", type: "bytes32" },
          ]},
          { name: "subjectiveCriteria", type: "string" },
          { name: "minScore", type: "uint256" },
          { name: "resultCommitment", type: "bytes32" },
          { name: "resultURI", type: "string" },
          { name: "juryCount", type: "uint256" },
          { name: "juryCommitted", type: "uint256" },
          { name: "juryRevealed", type: "uint256" },
          { name: "commitDeadline", type: "uint256" },
          { name: "revealDeadline", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// Fixed demo report — same every time
function generateReport(minLength: number): string {
  let content = `# 竞品分析报告

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
  let extra = 0;
  while (content.length < minLength) {
    content += `\n附录 ${++extra}：补充数据项，市场分析延伸内容。`;
  }
  return content;
}

function findCircuitsDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "circuits", "circuit_final.zkey");
    if (fs.existsSync(candidate)) return path.join(dir, "circuits");
    dir = path.dirname(dir);
  }
  throw new Error("circuits directory not found");
}

export async function POST(request: NextRequest) {
  const { taskId } = await request.json();

  const agentBKey = process.env.DEMO_AGENT_B_KEY as `0x${string}`;
  if (!agentBKey) return NextResponse.json({ error: "DEMO_AGENT_B_KEY not set" }, { status: 500 });

  const transport = http(RPC_URL);
  const account = privateKeyToAccount(agentBKey);
  const wallet = createWalletClient({ account, transport, chain: monadTestnet });
  const publicClient = createPublicClient({ transport, chain: monadTestnet });

  // Read task params from chain
  const task = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const minLength = Number(task.objective.minLength);
  const minFieldCount = Number(task.objective.minFieldCount);

  // Generate fixed report
  const content = generateReport(minLength);

  // Compute contentHash and commitment
  const rawHash = BigInt(keccak256(toBytes(content)));
  const contentHash = rawHash % FIELD_ORDER;

  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const commitmentField = poseidon([contentHash]);
  const commitment = poseidon.F.toObject(commitmentField) as bigint;

  // Generate ZK proof
  const snarkjs = await import("snarkjs");
  const circuitsDir = findCircuitsDir();
  const wasmPath = path.join(circuitsDir, "result_verifier_js", "result_verifier.wasm");
  const zkeyPath = path.join(circuitsDir, "circuit_final.zkey");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      contentHash: contentHash.toString(),
      length: content.length.toString(),
      fieldCount: minFieldCount.toString(),
      minLength: minLength.toString(),
      minFields: minFieldCount.toString(),
      commitment: commitment.toString(),
    },
    wasmPath,
    zkeyPath,
  );

  const proofA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const proofB: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const proofC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const pubSignals: [bigint, bigint, bigint] = [
    BigInt(publicSignals[0]),
    BigInt(publicSignals[1]),
    BigInt(publicSignals[2]),
  ];

  const resultCommitment = toHex(commitment, { size: 32 });
  const resultURI = `ipfs://QmArbiterDemo${taskId}`;

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: ABI,
    functionName: "submitResult",
    args: [BigInt(taskId), resultCommitment, resultURI, proofA, proofB, proofC, pubSignals],
    gas: 1_500_000n,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ success: true, hash, resultURI });
}
