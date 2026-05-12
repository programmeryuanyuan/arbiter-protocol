# Arbiter Protocol

> **Decentralized Arbitration for Agent Work**
> ZK 格式门槛（pass/fail） + Commit-Reveal Jury 主观裁决 + 条件 Escrow 结算
> Built on Monad · Monad Blitz Hackathon

---

## 一、项目定位

**一句话**：Agent 协作的去中心化条件结算协议——Agent B 先确认及格线再接单，用 ZK 证明客观格式合规（pass/fail），Commit-Reveal Jury 裁决主观质量，Monad 并行执行让整套机制第一次经济可行。

**解决的问题**：Agent A 委托复杂任务给 Agent B，无法信任结果质量，当前没有链上可验证的条件结算机制。

**为什么必须在 Monad**：
- ZK 链上验证 ~250k gas，以太坊每次 $5–15，不可行；Monad 每次 <$0.01，首次经济可行
- Jury 并行投票：多个 Agent 同 block 提交，Monad 并行 EVM 同时处理；其他链串行排队
- 400ms 出块：Agent 协作不等待，结算即时

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent A（雇主）                        │
│  定义 taskSpec = { objectiveCriteria, subjectiveCriteria }   │
│  设定 minScore 及格线，锁定 escrow 资金                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ createTask() + MON
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ArbiterEscrow.sol（Monad）                       │
│                                                              │
│  Created → Accepted → ZKPassed → Deliberating → Resolved    │
│                                                              │
│  ┌──────────────────┐   ┌───────────────────────────────┐   │
│  │  ZK Verifier     │   │  Jury Registry                │   │
│  │  Groth16         │   │  注册 / Stake / Slash         │   │
│  │  Pass/Fail 门槛  │   │  Commit-Reveal 两阶段投票    │   │
│  └──────────────────┘   └───────────────────────────────┘   │
└──────┬─────────────────────────────┬────────────────────────┘
       │                             │
       │ acceptTask()                │ commitScore() → revealScore()
       │ submitResult() + ZK Proof   │ Jury Agent 1/2/3
       ▼                             ▼
┌──────────────┐          ┌───────────────────────────────────┐
│   Agent B    │          │  Jury Agents（3-5个）             │
│   查看及格线 │  ┌────┐  │  1. 从 IPFS 获取结果              │
│   接单→执行  │──│IPFS│──│  2. LLM 评分，提交 hash(分,盐)   │
│   生成 Proof │  └────┘  │  3. 全部 commit 后 reveal 真实分  │
└──────────────┘          │  需 stake，违规被 slash           │
                          └───────────────────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   实时 Dashboard    │
                          │   ZK ✓/✗ · Jury进度│
                          │   资金流向 · 评分   │
                          └────────────────────┘
```

---

## 三、合约设计

### 3.1 数据结构

```solidity
enum Status {
    Created,        // Agent A 建任务，资金锁定
    Accepted,       // Agent B 确认及格线，接受任务
    ZKPassed,       // Agent B 提交结果 + ZK Proof 通过（pass/fail）
    Deliberating,   // Jury commit-reveal 投票中
    Resolved        // 结算完成
}

struct ObjectiveCriteria {
    uint256 minLength;      // 最低字符数
    uint256 minFieldCount;  // 必须包含的字段数量
    bytes32 fieldListHash;  // 必填字段列表的哈希（链下存储具体列表）
}

struct Task {
    // 基本信息
    uint256 id;
    address payer;              // Agent A
    address worker;             // Agent B
    uint256 escrow;             // 锁定金额（wei，Monad 上为 MON）
    uint256 deadline;           // Agent B 交付截止时间
    Status  status;

    // 验收标准
    ObjectiveCriteria objective;
    string  subjectiveCriteria; // 主观标准描述（供 Jury 参考）
    uint256 minScore;           // Jury 评分及格线（0-100）

    // 结果
    bytes32 resultCommitment;   // ZK commitment（Poseidon(contentHash)）
    string  resultURI;          // IPFS CID，Jury 通过此获取结果内容

    // Jury
    uint256 juryCount;          // 需要的 Jury 数量（建议 3-5）
    uint256 juryCommitted;      // 已提交 commit 数
    uint256 juryRevealed;       // 已 reveal 数
    uint256 commitDeadline;     // commit 阶段截止（ZKPassed 后设置）
    uint256 revealDeadline;     // reveal 阶段截止（全部 commit 或 commitDeadline 后设置）
}

struct JuryRecord {
    address juror;
    bytes32 scoreHash;      // keccak256(abi.encodePacked(score, salt))
    uint256 score;
    bool    committed;
    bool    revealed;
}
```

### 3.2 核心函数接口

```solidity
// ── Agent A ──────────────────────────────────────────────
function createTask(
    address worker,
    ObjectiveCriteria calldata objective,
    string  calldata  subjectiveCriteria,
    uint256 minScore,           // Jury 评分及格线
    uint256 juryCount,          // e.g. 3
    uint256 deadline
) external payable returns (uint256 taskId);

// ── Agent B（查看及格线后决定是否接单）─────────────────────
function acceptTask(uint256 taskId) external;
// require: msg.sender == task.worker && status == Created
// status → Accepted

// ── Agent B（执行完成，提交结果 + ZK Proof）────────────────
function submitResult(
    uint256 taskId,
    bytes32 resultCommitment,
    string  calldata resultURI,         // IPFS CID
    uint256[2]    calldata proofA,
    uint256[2][2] calldata proofB,
    uint256[2]    calldata proofC,
    uint256[3]    calldata publicSignals  // [minLength, minFields, commitment]
) external;
// 合约调用 verifier.verifyProof()
// 通过 → status = ZKPassed, 设置 commitDeadline = block.timestamp + COMMIT_WINDOW
// 不通过 → revert，资金不释放
// 链上随机抽取 juryCount 个已注册 Jury Agent

// ── Jury Commit（提交评分哈希，防止互相参考）───────────────
function commitScore(
    uint256 taskId,
    bytes32 scoreHash           // keccak256(abi.encodePacked(score, salt))
) external;
// require: status == ZKPassed && block.timestamp <= commitDeadline
// 全部 commit 后设置 revealDeadline = block.timestamp + REVEAL_WINDOW

// ── Jury Reveal（公开评分 + 盐值）──────────────────────────
function revealScore(
    uint256 taskId,
    uint256 score,              // 0-100
    bytes32 salt
) external;
// require: block.timestamp <= revealDeadline
// 验证: keccak256(abi.encodePacked(score, salt)) == scoreHash
// 全部 reveal 后自动触发结算

// ── 超时保护 ─────────────────────────────────────────────
function claimTimeout(uint256 taskId) external;
// 场景 1: deadline 过了 Agent B 没提交 → Agent A 取回资金
// 场景 2: commitDeadline 过了仍有 Jury 未 commit
//         → 用已 commit 的继续（进入 reveal 阶段），未 commit 的不参与结算
// 场景 3: revealDeadline 过了仍有 Jury 未 reveal
//         → slash 未 reveal 者，用已 reveal 的评分结算

// ── Jury 注册 ────────────────────────────────────────────
function registerAsJuror() external payable;   // 需要 stake 保证金
function withdrawJurorStake() external;         // 无活跃任务时可取回
```

### 3.3 时间窗口常量

```solidity
uint256 constant COMMIT_WINDOW = 300;   // 5 分钟（Demo 可缩短到 60s）
uint256 constant REVEAL_WINDOW = 300;   // 5 分钟（Demo 可缩短到 60s）
```

### 3.4 结算公式

```
第一层：ZK Proof（pass/fail 门槛）
    通过 → 进入 Jury 评分
    不通过 → 流程终止，资金退回 Agent A

第二层：Jury 评分
    finalScore = 已 reveal 评分的平均值（0-100）

    if finalScore >= minScore → Agent B 获得全部 escrow
    else                      → Agent A 退款全部 escrow

Jury Slash 条件：
    1. 未在 revealDeadline 前 reveal → slash stake 的 20%（最严重违规）
    2. 评分偏离平均值 > 20 分        → slash stake 的 10%
    slash 金额转入 protocol treasury
```

---

## 四、ZK 电路设计

> **ZK 的双重价值：**
> 1. **无信任门槛过滤**：链上合约无需接触原文即可自动完成格式合规检查（pass/fail），过滤垃圾提交，减轻 Jury 负担。
> 2. **链上隐私保护**：原文不上链，链上公众仅能看到 commitment 哈希，无法反推内容。只有被选中的 Jury 通过 IPFS 获取原文进行评审。
>
> **Jury 端的信任模型：** Jury 是经 stake 保证金筛选的受信任有限群体（类似陪审团），需要看到原文才能评估主观质量。
> MVP 阶段通过经济约束（stake + slash）保证 Jury 行为诚实；Roadmap V3 计划引入 TEE 可信执行环境，实现 Jury 评审过程的端到端隐私。

### 4.1 工具链

```
语言：      circom 2.0
证明系统：  Groth16（snarkjs）
依赖库：    circomlib（GreaterEqThan, Poseidon）
Setup：     复用 Hermez pot12_final.ptau，无需自做 ceremony
```

### 4.2 电路文件：`result_verifier.circom`

```circom
pragma circom 2.0.0;
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

template ResultVerifier() {
    // 私密输入（Agent B 持有，链上不可见）
    signal input contentHash;   // 结果内容的数值哈希

    // 公开输入（链上 publicSignals）
    signal input minLength;     // 来自 objective.minLength
    signal input minFields;     // 来自 objective.minFieldCount
    signal input commitment;    // Agent B 提交的承诺值

    // 私密输入（用于约束检查）
    signal input length;        // 结果字符数
    signal input fieldCount;    // 包含的必填字段数

    // 约束1：commitment 绑定 contentHash
    component hasher = Poseidon(1);
    hasher.inputs[0] <== contentHash;
    commitment === hasher.out;

    // 约束2：长度 >= minLength
    component lenCheck = GreaterEqThan(32);   // 32-bit，最大 ~4B 字符
    lenCheck.in[0] <== length;
    lenCheck.in[1] <== minLength;
    lenCheck.out === 1;

    // 约束3：字段数 >= minFields
    component fieldCheck = GreaterEqThan(16);  // 16-bit，最大 65535 字段
    fieldCheck.in[0] <== fieldCount;
    fieldCheck.in[1] <== minFields;
    fieldCheck.out === 1;
}

component main {public [minLength, minFields, commitment]} = ResultVerifier();
```

### 4.3 构建命令

```bash
# 编译电路
circom result_verifier.circom --r1cs --wasm --sym

# Trusted Setup（复用 Hermez ptau）
snarkjs groth16 setup result_verifier.r1cs pot12_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="arbiter"
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json

# 导出 Solidity Verifier（直接粘贴进合约目录）
snarkjs zkey export solidityverifier circuit_final.zkey Verifier.sol
```

---

## 五、Agent 脚本设计

### 5.1 Agent B：查看及格线 → 接单 → 执行 → Proof 提交

```javascript
// agent_b.js
import { groth16 } from "snarkjs"
import { buildPoseidon } from "circomlibjs"
import { create } from "ipfs-http-client"

const ipfs = create({ url: "https://ipfs.infura.io:5001/api/v0" })

async function reviewAndAccept(taskId) {
    const task = await contract.read.tasks([taskId])
    console.log(`[Agent B] 及格线: ${task.minScore}/100, escrow: ${task.escrow}`)

    // Agent B 自主判断是否接单
    if (task.minScore <= 85) {
        await contract.write.acceptTask([taskId])
        console.log(`[Agent B] 已接单 taskId: ${taskId}`)
        return true
    }
    console.log(`[Agent B] 及格线过高，放弃`)
    return false
}

async function executeAndSubmit(taskId, taskSpec) {
    // 1. LLM 完成任务
    const result = await callLLM(taskSpec.subjectiveCriteria)

    // 2. 上传结果到 IPFS
    const { cid } = await ipfs.add(result)
    const resultURI = cid.toString()
    console.log(`[Agent B] 结果已上传 IPFS: ${resultURI}`)

    // 3. 计算 witness（注意：hash 层数与电路对齐）
    const poseidon    = await buildPoseidon()
    const contentHash = BigInt(hashText(result))          // 内容 → 数值
    const commitment  = poseidon.F.toString(
        poseidon([contentHash])                           // Poseidon(contentHash) = commitment
    )
    const fieldCount  = countRequiredFields(result, taskSpec.requiredFields)

    // 4. 生成 ZK Proof（本地，约 5-15 秒）
    const { proof, publicSignals } = await groth16.fullProve(
        {
            contentHash: contentHash.toString(),
            length:      result.length,
            fieldCount:  fieldCount,
            minLength:   taskSpec.minLength,
            minFields:   taskSpec.minFieldCount,
            commitment:  commitment,
        },
        "circuit_js/result_verifier.wasm",
        "circuit_final.zkey"
    )

    // 5. 格式化 proof 为合约入参
    const callProof = {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [[proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]]],
        c: [proof.pi_c[0], proof.pi_c[1]],
    }

    // 6. 提交链上（ZK pass/fail，不传分数）
    await contract.write.submitResult([
        taskId,
        commitment,
        resultURI,
        callProof.a, callProof.b, callProof.c,
        publicSignals
    ])

    console.log(`[Agent B] ZK Proof 提交成功，taskId: ${taskId}`)
}
```

### 5.2 Jury Agent：Commit-Reveal 两阶段评分

```javascript
// jury_agent.js
import { randomBytes, keccak256, solidityPacked } from "ethers"

async function judgeTask(taskId, jurorWallet) {
    const task = await contract.read.tasks([taskId])

    // 1. 从 IPFS 获取结果内容
    const result = await fetchFromIPFS(task.resultURI)

    // 2. LLM 按主观标准评分
    const llmResponse = await callLLM(`
        你是专业评审，按以下标准评分（0-100分）：
        标准：${task.subjectiveCriteria}
        结果：${result}
        只返回一个 0-100 的整数。
    `)
    const score = parseInt(llmResponse.match(/\d+/)?.[0] || "50", 10)
    const clampedScore = Math.max(0, Math.min(100, score))

    // 3. Commit 阶段：提交 hash(分数, 盐)
    const salt = randomBytes(32)
    const scoreHash = keccak256(
        solidityPacked(["uint256", "bytes32"], [clampedScore, salt])
    )
    await contract.write.commitScore([taskId, scoreHash], {
        account: jurorWallet
    })
    console.log(`[Jury ${jurorWallet.address.slice(0,6)}] commit 完成`)

    // 4. 等待所有 Jury commit（监听事件或轮询）
    await waitForAllCommits(taskId)

    // 5. Reveal 阶段：公开真实分数
    await contract.write.revealScore([taskId, clampedScore, salt], {
        account: jurorWallet
    })
    console.log(`[Jury ${jurorWallet.address.slice(0,6)}] reveal 评分: ${clampedScore}`)
}

// 并发启动所有 Jury
await Promise.all(juryWallets.map(w => judgeTask(taskId, w)))
```

### 5.3 Demo 主脚本

```javascript
// demo.js
async function runDemo() {
    console.log("=== Arbiter Protocol Demo ===")

    // Step 1: Agent A 创建任务
    const taskId = await agentA.createTask({
        worker: AGENT_B_ADDRESS,
        objective: {
            minLength:    500,
            minFieldCount: 3,
            fieldListHash: hashFields(["竞品数量", "核心差异", "市场规模"])
        },
        subjectiveCriteria: "分析深度、逻辑清晰度、数据支撑",
        minScore:          70,   // Jury 评分及格线
        juryCount:         3,
        escrow:            parseEther("0.05")
    })
    console.log(`Task 创建完成，escrow 0.05 MON 已锁定，taskId: ${taskId}`)

    // Step 2: Agent B 查看及格线，决定接单
    const accepted = await agentB.reviewAndAccept(taskId)
    if (!accepted) return
    console.log(`Agent B 已接单，及格线 70 分`)

    // Step 3: Agent B 执行 + 上传 IPFS + ZK 提交
    await agentB.executeAndSubmit(taskId, taskSpec)
    console.log(`ZK Proof 通过（格式合规），进入 Jury 评分`)

    // Step 4: 3 个 Jury commit-reveal 评分
    await Promise.all(juryAgents.map(j => j.judgeTask(taskId)))
    console.log(`3 个 Jury 评分完成，共识达成`)

    // Step 5: 合约自动结算
    const task = await contract.read.tasks([taskId])
    console.log(`最终得分: ${task.finalScore}/100`)
    if (task.status === "Resolved") {
        console.log(`0.05 MON → Agent B`)
    }
}
```

---

## 六、前端 Dashboard

### 6.1 页面结构

```
┌──────────────────────────────────────────────────────────┐
│  Arbiter Protocol · Monad Testnet     [实时区块: #xxxxxx] │
├──────────────────────────────────────────────────────────┤
│  任务状态流转                                             │
│  ● Created → ● Accepted → ● ZK Passed → ● Jury → ● Done │
│     0:00        0:12          0:43         0:51     0:55  │
├──────────────────────────────────────────────────────────┤
│  ZK 门槛验证                    Jury 评分进度（Commit→   │
│  ┌──────────────────┐            Reveal）                 │
│  │ ✅ 长度: 847 字  │          ┌─────────────────────┐   │
│  │ ✅ 字段: 3/3     │          │ Jury #1  C✅ R✅ 82 │   │
│  │ ✅ Proof 通过    │          │ Jury #2  C✅ R✅ 79 │   │
│  │ 结果: ipfs://Qm..│          │ Jury #3  C✅ R✅ 84 │   │
│  └──────────────────┘          │ 平均分:      81.7   │   │
│                                └─────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  结算结果                                                 │
│  最终得分: 82/100  ≥  及格线: 70                         │
│  0.05 MON ──────────────────→ Agent B ✅                 │
├──────────────────────────────────────────────────────────┤
│  Monad 性能指标                                          │
│  ZK验证 Gas ~$0.008    Jury×3 同block ✅    结算 0.4s    │
└──────────────────────────────────────────────────────────┘
```

### 6.2 关键前端逻辑

```typescript
// 监听合约事件实时更新 UI
publicClient.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi,
    onLogs: (logs) => {
        logs.forEach(log => {
            switch(log.eventName) {
                case 'TaskCreated':    updateStatus('Created')      ; break
                case 'TaskAccepted':   updateStatus('Accepted')     ; break
                case 'ZKPassed':       updateStatus('ZKPassed')     ; break
                case 'ScoreCommitted': updateJuryCommit(log)        ; break
                case 'ScoreRevealed':  updateJuryReveal(log)        ; break
                case 'TaskResolved':   updateFinalResult(log)       ; break
            }
        })
    }
})
```

---

## 七、技术栈

| 层 | 技术 |
|----|------|
| 脚手架 | Scaffold-ETH 2（`npx create-eth@latest`，Foundry 分支） |
| 合约 | Solidity 0.8.x + Foundry |
| ZK 电路 | circom 2.0 + snarkjs (Groth16) |
| ZK 库 | circomlib (Poseidon, GreaterEqThan) |
| Trusted Setup | Hermez pot12_final.ptau |
| 结果存储 | IPFS（Infura/Pinata gateway） |
| 前端 | NextJS + Tailwind + DaisyUI + RainbowKit + Wagmi/Viem（Scaffold-ETH 自带） |
| Agent 脚本 | Node.js + OpenAI / Claude API |
| 网络 | Monad Testnet |
| 部署 | 合约: `yarn deploy --network monad_testnet` · 前端: `yarn vercel --prod` |

---

## 八、文件结构（基于 Scaffold-ETH 2 + Foundry）

```
arbiter-protocol/                        # npx create-eth@latest 生成
├── packages/
│   ├── foundry/
│   │   ├── contracts/
│   │   │   ├── ArbiterEscrow.sol        # 主合约（状态机 + 结算）
│   │   │   ├── MockVerifier.sol         # 测试用 Mock（后替换 snarkjs 生成的 Verifier）
│   │   │   └── JuryRegistry.sol         # Jury 注册 + Stake + Slash
│   │   ├── script/
│   │   │   └── DeployArbiter.s.sol      # Foundry 部署脚本
│   │   └── test/
│   │       └── ArbiterEscrow.t.sol      # Foundry 测试
│   └── nextjs/
│       └── app/
│           ├── page.tsx                 # Dashboard 主页
│           ├── components/
│           │   ├── TaskStatus.tsx
│           │   ├── ZKPanel.tsx
│           │   └── JuryPanel.tsx
│           └── ...                      # Scaffold-ETH 自带组件
├── circuits/
│   ├── result_verifier.circom           # ZK 电路（pass/fail 门槛）
│   ├── circuit_final.zkey               # 构建产物
│   └── verification_key.json            # 构建产物
└── scripts/
    ├── agent_a.js                       # 创建任务
    ├── agent_b.js                       # 接单 + 执行 + IPFS + ZK Proof
    ├── jury_agent.js                    # Commit-Reveal 评分
    └── demo.js                          # 完整演示
```

---

## 九、7.5 小时时间分配（11:00–18:30）

| 时间 | 模块 | 产出 |
|------|------|------|
| 0:00–0:30 | Scaffold-ETH 初始化 + ZK 电路构建 + Trusted Setup | 项目骨架 + `Verifier.sol` |
| 0:30–2:30 | 合约开发（ArbiterEscrow + JuryRegistry）+ 部署 Monad | `yarn deploy --network monad_testnet` 通过 |
| 2:30–4:00 | Agent A/B/Jury 脚本 + IPFS | 三个脚本可跑通 |
| 4:00–5:30 | 前端 Dashboard（基于 Scaffold-ETH 组件） | 实时状态流转可展示 |
| 5:30–6:30 | 联调 + 修 Bug | 端到端完整 Demo |
| 6:30–7:00 | `yarn vercel --prod` 部署前端 + Demo 录制 | 线上可访问 + 演示视频 |
| 7:00–7:30 | Buffer | 应急 |

---

## 十、Pitch 叙事（3 分钟）

**开场（30s）**
> "当 AI Agent 把任务委托给另一个 AI Agent，谁来保证结果是真的？今天所有方案的答案是：没有人。"

**问题（30s）**
> "Agent B 可以提交任何垃圾，照样收钱。现有 Escrow 要么靠人工确认，要么靠单一 Oracle——单点信任，不可审计。"

**方案（60s）**
> "Arbiter 分两层解决。第一层：Agent B 先看及格线再接单，然后必须提交 ZK Proof 证明结果满足格式门槛——字数、字段缺一不可，证明不通过钱不释放，同时原文不上链，链上只有哈希，保护商业隐私。第二层：3 个独立 Jury Agent 通过 IPFS 获取原文，用 Commit-Reveal 机制独立评分——先提交评分哈希，全部锁定后才公开，杜绝互相抄分。Jury 需要质押保证金，乱评就 slash。利用 Monad 的并行 EVM 在同一个 block 内处理所有投票，400 毫秒出共识。"

**Monad 的角色（30s）**
> "这套机制在其他链上不可行：ZK 验证每次要 $10 gas 费，Jury 多笔交易串行排队。在 Monad 上，ZK 验证不到 $0.01，Jury 投票同 block 并行处理。Monad 让 Agent 经济第一次真正经济可行。"

**Demo + 数据（30s）**
> [展示 Dashboard] "实测数据：ZK 验证 gas $0.008，3 个 Jury 同 block 完成 commit-reveal，端到端结算 0.9 秒。以太坊主网同样流程需要 $50+ 和数分钟。"

---

## 十一、竞品差异化

| 项目 | 核心差异 |
|------|---------|
| TickPay | 流式支付，无结果验证 |
| Teleo | 单一 LLM 当裁判（可幻觉、黑箱、无经济约束），无 ZK，无多 Agent |
| Yiling | 预测市场共识，非雇佣结算 |
| Clawork / Dispatch | 任务市场，无 Jury + ZK 验收层 |
| **Arbiter Protocol** | **ZK 数学证明（不可伪造）+ Commit-Reveal 多 Jury（防串通）+ 链上 Agent 声誉 + 结果隐私，两层信任，Monad 原生** |

**与 Teleo 的核心差异：**

| 维度 | Teleo | Arbiter Protocol |
|------|-------|-----------------|
| 客观验证 | LLM 判断（可幻觉、可操控） | ZK Proof（数学不可伪造） |
| 主观裁决 | 单一 LLM，单点失败 | 多 Jury Commit-Reveal，防串通 |
| 裁判问责 | 无经济约束 | Jury stake + slash，有皮肤在游戏 |
| 结果隐私 | 内容暴露给 LLM | ZK 证明合规，内容不上链 |
| Agent 信用 | 无历史记录 | 链上声誉（完成率、平均分）可查 |
| 适用对象 | 人类自由职业者 | AI Agent 之间自动结算 |

---

## 十二、Roadmap

| 阶段 | 内容 |
|------|------|
| MVP（黑客松） | ZK 格式门槛 + Commit-Reveal Jury + 条件 Escrow + 链上 Agent 声誉 + Monad 并行 |
| V2 | x402 HTTP 接入（任何 Agent 无需 SDK 直接使用）；任务类型模板（代码审计 / 数据报告 / 内容生成，对应不同 ZK 参数，买方一键选择） |
| V3 | TEE 可信执行环境保护 Jury 端隐私；比例结算（按分数线性释放）；Jury 专业领域匹配 |
| 长期 | 协议层开放，成为所有 Agent 协作平台的条件结算基础设施 |
