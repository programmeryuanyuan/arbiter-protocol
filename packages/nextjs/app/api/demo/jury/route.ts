import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const runtime = "nodejs";

const RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || "0xD7f22e2c4ef4127c4B93e027c041a91E22635679") as `0x${string}`;

// Fixed scores — deterministic for every demo run
const FIXED_SCORES = [82n, 85n, 79n];

// Deterministic salt per juror per task
function demoSalt(jurorIndex: number, taskId: number): `0x${string}` {
  return keccak256(encodePacked(["string", "uint256", "uint256"], [`demo_salt_jury`, BigInt(jurorIndex), BigInt(taskId)]));
}

const ABI = [
  {
    name: "commitScore",
    type: "function",
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "scoreHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "revealScore",
    type: "function",
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "salt", type: "bytes32" },
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

async function waitForStatus(
  publicClient: ReturnType<typeof createPublicClient>,
  taskId: bigint,
  targetStatus: number,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: ABI,
      functionName: "getTask",
      args: [taskId],
    });
    if (Number(task.status) >= targetStatus) return task;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Timeout waiting for status ${targetStatus}`);
}

export async function POST(request: NextRequest) {
  const { taskId } = await request.json();
  const tid = BigInt(taskId);

  const juryKeys = [
    process.env.DEMO_JURY_1_KEY,
    process.env.DEMO_JURY_2_KEY,
    process.env.DEMO_JURY_3_KEY,
  ] as `0x${string}`[];

  if (juryKeys.some(k => !k)) {
    return NextResponse.json({ error: "DEMO_JURY_1_KEY / DEMO_JURY_2_KEY / DEMO_JURY_3_KEY not set" }, { status: 500 });
  }

  const transport = http(RPC_URL);
  const publicClient = createPublicClient({ transport, chain: monadTestnet });

  // Phase 1: All 3 juries commit in parallel
  await Promise.all(
    juryKeys.map(async (key, i) => {
      const account = privateKeyToAccount(key);
      const wallet = createWalletClient({ account, transport, chain: monadTestnet });
      const salt = demoSalt(i, taskId);
      const scoreHash = keccak256(encodePacked(["uint256", "bytes32"], [FIXED_SCORES[i], salt]));
      const hash = await wallet.writeContract({
        address: ESCROW_ADDRESS,
        abi: ABI,
        functionName: "commitScore",
        args: [tid, scoreHash],
        gas: 150_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    })
  );

  // Wait for status to advance to Deliberating (3 = Deliberating)
  await waitForStatus(publicClient, tid, 3);

  // Phase 2: All 3 juries reveal in parallel
  await Promise.all(
    juryKeys.map(async (key, i) => {
      const account = privateKeyToAccount(key);
      const wallet = createWalletClient({ account, transport, chain: monadTestnet });
      const salt = demoSalt(i, taskId);
      const hash = await wallet.writeContract({
        address: ESCROW_ADDRESS,
        abi: ABI,
        functionName: "revealScore",
        args: [tid, FIXED_SCORES[i], salt],
        gas: 200_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    })
  );

  // Wait for Resolved (4)
  const finalTask = await waitForStatus(publicClient, tid, 4);

  return NextResponse.json({
    success: true,
    scores: FIXED_SCORES.map(Number),
    avgScore: FIXED_SCORES.reduce((a, b) => a + b, 0n) / BigInt(FIXED_SCORES.length),
    status: Number(finalTask.status),
  });
}
