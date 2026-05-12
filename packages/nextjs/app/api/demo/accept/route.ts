import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const runtime = "nodejs";

const RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || "0xD7f22e2c4ef4127c4B93e027c041a91E22635679") as `0x${string}`;

const ABI = [
  {
    name: "acceptTask",
    type: "function",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export async function POST(request: NextRequest) {
  const { taskId } = await request.json();

  const agentBKey = process.env.DEMO_AGENT_B_KEY as `0x${string}`;
  if (!agentBKey) return NextResponse.json({ error: "DEMO_AGENT_B_KEY not set" }, { status: 500 });

  const account = privateKeyToAccount(agentBKey);
  const transport = http(RPC_URL);
  const wallet = createWalletClient({ account, transport, chain: monadTestnet });
  const publicClient = createPublicClient({ transport, chain: monadTestnet });

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: ABI,
    functionName: "acceptTask",
    args: [BigInt(taskId)],
    gas: 100_000n,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ success: true, hash, worker: account.address });
}
