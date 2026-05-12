/**
 * 给 Demo 账号批量充值
 * 用法: node scripts/fund_demo_accounts.mjs
 * 会提示输入 Agent A 的加密密码
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { Wallet } from "ethers";
import * as dotenv from "dotenv";
import * as readline from "readline";
import * as path from "path";

dotenv.config({ path: path.resolve("packages/hardhat/.env") });

const RPC_URL = "https://testnet-rpc.monad.xyz";

const RECIPIENTS = [
  { label: "Jury 1", address: "0x59A6c011ebd5ee58E61869b5660c4921A4B2dA4c" },
  { label: "Jury 2", address: "0x4571f155203fc28830535E86352004F156917581" },
  { label: "Jury 3", address: "0x235aEb935cEf4583d061091AF73C8401026c2A49" },
];

const AMOUNT_EACH = "0.5"; // MON per account

async function askPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question("Agent A 解密密码: ", answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!encryptedKey) {
    console.error("❌ 找不到 DEPLOYER_PRIVATE_KEY_ENCRYPTED，请确认在项目根目录运行");
    process.exit(1);
  }

  const keyJson = JSON.parse(encryptedKey);
  console.log(`Agent A 地址: 0x${keyJson.address}`);

  const password = await askPassword();

  let wallet;
  try {
    wallet = await Wallet.fromEncryptedJson(encryptedKey, password);
  } catch {
    console.error("❌ 密码错误");
    process.exit(1);
  }

  console.log(`✅ 解密成功\n`);

  const account = privateKeyToAccount(wallet.privateKey);
  const transport = http(RPC_URL);
  const walletClient = createWalletClient({ account, transport, chain: monadTestnet });
  const publicClient = createPublicClient({ transport, chain: monadTestnet });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`余额: ${formatEther(balance)} MON`);
  console.log(`准备转账: ${AMOUNT_EACH} MON × ${RECIPIENTS.length} = ${Number(AMOUNT_EACH) * RECIPIENTS.length} MON\n`);

  if (balance < parseEther(AMOUNT_EACH) * BigInt(RECIPIENTS.length)) {
    console.error("❌ 余额不足");
    process.exit(1);
  }

  for (const { label, address } of RECIPIENTS) {
    const hash = await walletClient.sendTransaction({
      to: address,
      value: parseEther(AMOUNT_EACH),
    });
    console.log(`✓ ${label} (${address})  tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  console.log("\n✅ 全部转账完成");
}

main().catch(console.error);
