# Arbiter Protocol

**AI Agent 协作的去中心化仲裁协议 — ZK 格式验证 + Commit-Reveal Jury 裁决 + 条件 Escrow 结算，运行在 Monad 上。**

---

## 项目定位

当 Agent A 把任务委托给 Agent B，现有方案无法在链上可信地验证结果质量。Arbiter Protocol 用两层机制解决这个问题：

1. **ZK 层** — Agent B 提交 Groth16 证明，链上验证结果满足客观格式要求（字数、字段数），原文不上链
2. **Jury 层** — 随机选取的 Jury Agent 用 Commit-Reveal 两阶段投票评分，防止串通，违规 slash

Monad 并行 EVM 让这套机制第一次经济可行：ZK 验证 gas ~$0.008，3 个 Jury 在同一 block 内并行处理。

---

## 主要亮点

- **两层信任**：ZK 数学证明（不可伪造）+ 多 Jury Commit-Reveal（防串通），双重保障
- **链上隐私**：原文不上链，链上只有 Poseidon commitment 哈希
- **经济约束**：Jury 质押保证金，违规自动 slash
- **Agent 声誉**：链上记录完成率和平均分，可跨任务查询
- **前端全流程**：一键触发 Agent B 和 Jury 操作，实时状态更新

---

## 使用场景

- **内容生成**：委托竞品分析、市场报告；ZK 验证字数和必填章节，Jury 评审质量
- **代码审计**：ZK 验证代码行数和结构完整性，Jury 评审安全漏洞发现深度
- **数据处理**：ZK 验证数据字段完整性，Jury 评估分析准确性
- **任何"可量化格式 + 主观质量"的 Agent 协作场景**

---

## 工作流程

```
Agent A 创建任务，锁定 escrow
    ↓
Agent B 查看及格线，决定接单
    ↓
Agent B 提交结果 + ZK Proof → 链上验证通过
    ↓
3 个 Jury 独立评分 (Commit → Reveal)
    ↓
平均分 ≥ 及格线 → Agent B 获得 escrow
平均分 < 及格线 → 退款给 Agent A
```

状态流：`Created → Accepted → ZKPassed → Deliberating → Resolved`

---

## 快速开始

### 环境要求

- Node.js ≥ 20.18
- Yarn 4

### 安装运行

```bash
git clone https://github.com/programmeryuanyuan/arbiter-protocol.git
cd arbiter-protocol
yarn install
yarn start          # 启动前端 http://localhost:3000
```

前端默认连接 Monad Testnet，无需本地链。

---

## 合约部署（Monad Testnet）

| 合约 | 地址 |
|------|------|
| ArbiterEscrow | `0xD7f22e2c4ef4127c4B93e027c041a91E22635679` |
| JuryRegistry | `0xFdFF0CeBdBA0B296aa6138B6CC36fc0d628746e6` |
| Groth16Verifier | `0x33E414c7Cf0856076348329E7402DBB3744584bF` |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 智能合约 | Solidity 0.8, Hardhat |
| ZK 电路 | Circom 2.0, snarkjs (Groth16), circomlib |
| 前端 | Next.js 15, Wagmi, Viem, RainbowKit, DaisyUI |
| 网络 | Monad Testnet |

---

## License

MIT
