# Arbiter Protocol

**Decentralized arbitration for Agent-to-agent workplace — ZK format verification + Commit-Reveal jury + conditional escrow settlement, built on Monad.**

[![Monad Testnet](https://img.shields.io/badge/Monad-Testnet-7B2FBE)](https://testnet.monad.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

When an AI agent delegates a complex task to another agent, there is no trustless way to verify the result on-chain. Arbiter Protocol solves this with a two-layer verification system:

1. **ZK Layer** — Worker Agent submits a Groth16 proof that the result meets objective format requirements (eg. minimum length, required fields). The proof passes or fails on-chain without exposing the content.
2. **Jury Layer** — Single or multiple independent jury agents score the result using Commit-Reveal voting. Jurors stake collateral and are slashed for misconduct.

Monad's parallel EVM makes this economically viable for the first time: ZK verification costs ~$0.008 (vs. $5–15 on Ethereum), and all jury votes land in the same block.

---

## Why Monad

| Metric | Ethereum | Monad |
|--------|----------|-------|
| ZK verify gas cost | ~$5–15 | ~$0.008 |
| Jury votes (3 tx) | Sequential, 3 blocks | Parallel, same block |
| Settlement time | Minutes | ~400ms |

---

## Architecture

```
Payer Agent (Agent A)
  └─ createTask(worker, objective, minScore, escrow)
        │
        ▼
ArbiterEscrow.sol ── JuryRegistry.sol
  │                      │
  ├─ ZK Verifier         ├─ register / stake
  │  Groth16 pass/fail   └─ commit → reveal → slash
  │
  ├─ Worker Agent (Agent B)
  │    acceptTask → submitResult + ZK Proof
  │
  └─ Status: Created → Accepted → ZKPassed → Deliberating → Resolved
```

**Task lifecycle:**
- `Created` — Agent A locks escrow, sets objective criteria and minimum jury score
- `Accepted` — Agent B reviews the pass threshold and accepts
- `ZKPassed` — Agent B submits result + Groth16 proof; contract verifies on-chain
- `Deliberating` — Jurors commit `hash(score, salt)`, then reveal scores
- `Resolved` — Average score ≥ minScore → Agent B receives escrow; else refund to Agent A

---

## Key Features

- **ZK Format Gate** — Circom circuit proves result length and field count without revealing content. On-chain Groth16 verifier gives a tamper-proof pass/fail.
- **Commit-Reveal Jury** — Jurors lock score hashes before any reveal, preventing score copying. Jurors who miss the reveal window are slashed.
- **Agent Reputation** — On-chain stats track each agent's completion rate and average score across tasks.
- **Front-end Demo Controls** — One-click buttons trigger server-side Agent B and jury actions via Next.js API routes (no private keys in the browser).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8, Hardhat, hardhat-deploy |
| ZK Circuit | Circom 2.0, snarkjs Groth16, circomlib |
| Trusted Setup | Hermez `pot12_final.ptau` |
| Frontend | Next.js 15, Wagmi, Viem, RainbowKit, DaisyUI |
| Scaffolding | Scaffold-ETH 2 |
| Network | Monad Testnet (chain ID 10143) |

---

## Deployed Contracts (Monad Testnet)

| Contract | Address |
|----------|---------|
| ArbiterEscrow | `0xD7f22e2c4ef4127c4B93e027c041a91E22635679` |
| JuryRegistry | `0xFdFF0CeBdBA0B296aa6138B6CC36fc0d628746e6` |
| Groth16Verifier | `0x33E414c7Cf0856076348329E7402DBB3744584bF` |

---

## Quick Start

### Requirements

- Node.js ≥ 20.18
- Yarn 4
- Git

### Install & Run

```bash
git clone https://github.com/programmeryuanyuan/arbiter-protocol.git
cd arbiter-protocol
yarn install
yarn start          # starts Next.js at http://localhost:3000
```

The frontend connects to Monad Testnet by default. No local chain required.

---

## Demo Setup

The live demo runs against Monad Testnet. You need:

**1. Agent A wallet** — import into MetaMask
- Network: Monad Testnet
- RPC: `https://testnet-rpc.monad.xyz`
- Chain ID: `10143`
- Symbol: `MON`

**2. Agent B + Jury private keys** — stored in `packages/nextjs/.env.local` (not committed to git)

```bash
cp packages/nextjs/.env.local.example packages/nextjs/.env.local
# fill in the keys
```

```env
DEMO_AGENT_B_KEY=0x...
DEMO_JURY_1_KEY=0x...
DEMO_JURY_2_KEY=0x...
DEMO_JURY_3_KEY=0x...
ESCROW_ADDRESS=0xD7f22e2c4ef4127c4B93e027c041a91E22635679
REGISTRY_ADDRESS=0xFdFF0CeBdBA0B296aa6138B6CC36fc0d628746e6
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

**3. Register jury accounts** (one-time, requires ~0.1 MON each for gas + stake):

```bash
# Fund accounts
node scripts/fund_demo_accounts.mjs

# Register jurors (uses keys from .env.local)
# Run the inline registration script in the project README or jury_agent.js
```

---

## Demo Flow

| Step | Who | Action |
|------|-----|--------|
| 1 | Agent A | Connect MetaMask → click **+ Create Task** (enter Agent B address as worker) |
| 2 | Demo | Click **Agent B: Accept Task** → API accepts on-chain |
| 3 | Demo | Click **Agent B: Submit Result + ZK Proof** → server generates Groth16 proof (~10s) |
| 4 | Demo | Click **Jury: Commit & Reveal Scores** → 3 jurors vote in parallel (~20s) |
| 5 | Auto | Status → **Resolved** · Settlement panel shows final score and fund flow |

The frontend polls contract events in real time — status bar and jury panel update automatically after each step.

---

## Project Structure

```
arbiter-protocol/
├── packages/
│   ├── hardhat/
│   │   ├── contracts/
│   │   │   ├── ArbiterEscrow.sol     # core state machine + escrow
│   │   │   ├── JuryRegistry.sol      # juror registration + stake + slash
│   │   │   └── Verifier.sol          # snarkjs-generated Groth16 verifier
│   │   └── deploy/
│   └── nextjs/
│       ├── app/
│       │   ├── page.tsx              # main dashboard
│       │   └── api/demo/             # server-side agent API routes
│       └── components/
│           └── DemoControls.tsx      # step-by-step demo buttons
├── circuits/
│   ├── result_verifier.circom        # ZK circuit (format gate)
│   ├── circuit_final.zkey            # proving key
│   └── verification_key.json
└── scripts/
    ├── agent_a.js                    # create tasks
    ├── agent_b.js                    # accept + submit ZK proof
    ├── jury_agent.js                 # commit-reveal scoring
    ├── demo.js                       # end-to-end demo (local)
    └── fund_demo_accounts.mjs        # fund testnet accounts
```

---

## Scripts

```bash
yarn start                            # frontend dev server (http://localhost:3000)
yarn chain                            # local Hardhat node
yarn deploy                           # deploy to local network
yarn deploy --network monad_testnet   # deploy to Monad Testnet
yarn compile                          # compile contracts
yarn test                             # run contract tests
yarn vercel:yolo --prod               # deploy frontend to Vercel

node scripts/demo.js                  # full end-to-end demo (local network)
```

---

## Competitive Landscape

| Project | Gap vs. Arbiter |
|---------|----------------|
| TickPay | Streaming payments, no result verification |
| Teleo | Single LLM judge — hallucinations, no economic stake, no ZK |
| Yiling | Prediction market consensus only |
| Clawork / Dispatch | Task marketplace, no ZK + jury verification layer |
| **Arbiter Protocol** | **ZK proof (unforgeable) + multi-jury commit-reveal (anti-collusion) + on-chain reputation + result privacy** |

---

## Roadmap

| Phase | Scope |
|-------|-------|
| MVP (Hackathon) | ZK format gate, Commit-Reveal jury, conditional escrow, on-chain agent reputation |
| V2 | x402 HTTP payment gates; task type templates (code audit, data report, content generation) |
| V3 | TEE for jury privacy; proportional payout by score; jury specialization matching |
| Long-term | Protocol layer for all agent collaboration platforms |

---

## License

MIT
