// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./JuryRegistry.sol";

/// @title ArbiterEscrow - Agent 协作条件结算协议
/// @notice ZK pass/fail 门槛 + Commit-Reveal Jury 主观裁决 + 条件 Escrow 结算
contract ArbiterEscrow {
    // ── 状态枚举 ──────────────────────────────────────────────
    enum Status {
        Created,      // Agent A 建任务，资金锁定
        Accepted,     // Agent B 确认及格线，接受任务
        ZKPassed,     // ZK Proof 通过（格式合规）
        Deliberating, // Jury commit-reveal 进行中
        Resolved      // 结算完成
    }

    // ── 数据结构 ──────────────────────────────────────────────
    struct ObjectiveCriteria {
        uint256 minLength;
        uint256 minFieldCount;
        bytes32 fieldListHash;
    }

    struct Task {
        uint256 id;
        address payer;
        address worker;
        uint256 escrow;      // 任务报酬（不含 jury 费）
        uint256 juryReward;  // 每个 Jury 的固定报酬
        uint256 deadline;
        Status status;
        ObjectiveCriteria objective;
        string subjectiveCriteria;
        uint256 minScore;
        bytes32 resultCommitment;
        string resultURI;
        uint256 juryCount;
        uint256 juryCommitted;
        uint256 juryRevealed;
        uint256 commitDeadline;
        uint256 revealDeadline;
    }

    struct JuryRecord {
        address juror;
        bytes32 scoreHash;
        uint256 score;
        bool committed;
        bool revealed;
    }

    // ── 常量 ──────────────────────────────────────────────────
    uint256 public constant COMMIT_WINDOW = 300; // 5 min（Demo 可改 60s）
    uint256 public constant REVEAL_WINDOW = 300;
    uint256 public constant SLASH_NO_REVEAL_BPS = 2000; // 20%
    uint256 public constant SLASH_DEVIATION_BPS = 1000; // 10%
    uint256 public constant MAX_DEVIATION = 20;

    // ── Agent 声誉 ────────────────────────────────────────────
    struct AgentStats {
        uint256 tasksCompleted; // 评分 >= minScore 的次数
        uint256 tasksFailed;    // 评分 < minScore 的次数
        uint256 totalScore;     // 累计得分（除以 completed+failed 得平均）
    }

    // ── 存储 ──────────────────────────────────────────────────
    uint256 public taskCount;
    mapping(uint256 => Task) public tasks;
    mapping(uint256 => JuryRecord[]) public juryRecords;
    mapping(uint256 => mapping(address => uint256)) public juryIndex; // taskId => juror => index+1
    mapping(address => AgentStats) public agentStats;

    JuryRegistry public juryRegistry;

    // ZK Verifier 接口（snarkjs 生成的 Verifier.sol）
    IVerifier public verifier;

    // ── 事件 ──────────────────────────────────────────────────
    event TaskCreated(uint256 indexed taskId, address payer, address worker, uint256 escrow, uint256 minScore);
    event TaskAccepted(uint256 indexed taskId, address worker);
    event ZKPassed(uint256 indexed taskId, string resultURI);
    event ScoreCommitted(uint256 indexed taskId, address juror);
    event ScoreRevealed(uint256 indexed taskId, address juror, uint256 score);
    event TaskResolved(uint256 indexed taskId, uint256 finalScore, bool passed, address recipient);
    event AgentStatsUpdated(address indexed agent, uint256 tasksCompleted, uint256 tasksFailed, uint256 totalScore);

    constructor(address _verifier, address _juryRegistry) {
        verifier = IVerifier(_verifier);
        juryRegistry = JuryRegistry(_juryRegistry);
    }

    // ── Agent A：创建任务 ─────────────────────────────────────
    function createTask(
        address worker,
        ObjectiveCriteria calldata objective,
        string calldata subjectiveCriteria,
        uint256 minScore,
        uint256 juryCount,
        uint256 deadline,
        uint256 juryReward  // 每个 Jury 的固定报酬（wei）
    ) external payable returns (uint256 taskId) {
        require(worker != address(0), "Invalid worker");
        require(minScore <= 100, "Score > 100");
        require(juryCount >= 1 && juryCount <= 5, "Jury 1-5");
        require(deadline > block.timestamp, "Deadline passed");
        uint256 totalJuryFee = juryReward * juryCount;
        require(msg.value > totalJuryFee, "Escrow too low");

        taskId = taskCount++;
        Task storage t = tasks[taskId];
        t.id = taskId;
        t.payer = msg.sender;
        t.worker = worker;
        t.escrow = msg.value - totalJuryFee;
        t.juryReward = juryReward;
        t.deadline = deadline;
        t.status = Status.Created;
        t.objective = objective;
        t.subjectiveCriteria = subjectiveCriteria;
        t.minScore = minScore;
        t.juryCount = juryCount;

        emit TaskCreated(taskId, msg.sender, worker, t.escrow, minScore);
    }

    // ── Agent B：查看及格线后接单 ──────────────────────────────
    function acceptTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.status == Status.Created, "Not Created");
        require(msg.sender == t.worker, "Not worker");

        t.status = Status.Accepted;
        emit TaskAccepted(taskId, msg.sender);
    }

    // ── Agent B：提交结果 + ZK Proof ──────────────────────────
    function submitResult(
        uint256 taskId,
        bytes32 resultCommitment,
        string calldata resultURI,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[3] calldata publicSignals // [minLength, minFields, commitment]
    ) external {
        Task storage t = tasks[taskId];
        require(t.status == Status.Accepted, "Not Accepted");
        require(msg.sender == t.worker, "Not worker");
        require(block.timestamp <= t.deadline, "Deadline passed");

        // 验证 publicSignals 与任务参数一致
        require(publicSignals[0] == t.objective.minLength, "minLength mismatch");
        require(publicSignals[1] == t.objective.minFieldCount, "minFields mismatch");
        require(publicSignals[2] == uint256(resultCommitment), "commitment mismatch");

        // ZK 验证
        require(
            verifier.verifyProof(proofA, proofB, proofC, publicSignals),
            "ZK proof invalid"
        );

        t.resultCommitment = resultCommitment;
        t.resultURI = resultURI;
        t.status = Status.ZKPassed;
        t.commitDeadline = block.timestamp + COMMIT_WINDOW;

        // 随机选取 Jury
        _selectJury(taskId);

        emit ZKPassed(taskId, resultURI);
    }

    // ── Jury：Commit 评分哈希（仅写自己的记录，无共享状态）─────
    function commitScore(uint256 taskId, bytes32 scoreHash) external {
        Task storage t = tasks[taskId];
        require(t.status == Status.ZKPassed, "Not in commit phase");
        require(block.timestamp <= t.commitDeadline, "Commit window closed");

        uint256 idx = juryIndex[taskId][msg.sender];
        require(idx > 0, "Not assigned jury");
        idx--;

        JuryRecord storage rec = juryRecords[taskId][idx];
        require(!rec.committed, "Already committed");

        rec.scoreHash = scoreHash;
        rec.committed = true;

        emit ScoreCommitted(taskId, msg.sender);
    }

    // ── 任意人：聚合 commit 结果，推进到 reveal 阶段 ────────────
    // 条件：全部 Jury 已 commit，或 commit 窗口已关闭
    function advanceToReveal(uint256 taskId) public {
        Task storage t = tasks[taskId];
        require(t.status == Status.ZKPassed, "Not in commit phase");
        require(t.commitDeadline > 0, "Commit phase not started");

        JuryRecord[] storage records = juryRecords[taskId];
        uint256 committed = 0;
        bool allCommitted = true;
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].committed) {
                committed++;
            } else {
                allCommitted = false;
            }
        }
        require(allCommitted || block.timestamp > t.commitDeadline, "Commit phase ongoing");

        if (committed == 0) {
            t.status = Status.Resolved;
            _transferTo(t.payer, t.escrow);
            emit TaskResolved(taskId, 0, false, t.payer);
            return;
        }

        t.juryCommitted = committed;
        t.juryCount = committed;
        t.revealDeadline = block.timestamp + REVEAL_WINDOW;
        t.status = Status.Deliberating;
    }

    // ── Jury：Reveal 真实评分（仅写自己的记录，无共享状态）──────
    function revealScore(uint256 taskId, uint256 score, bytes32 salt) external {
        Task storage t = tasks[taskId];
        require(t.status == Status.Deliberating, "Not deliberating");
        require(t.revealDeadline > 0, "Reveal not started");
        require(block.timestamp <= t.revealDeadline, "Reveal window closed");
        require(score <= 100, "Score > 100");

        uint256 idx = juryIndex[taskId][msg.sender];
        require(idx > 0, "Not assigned jury");
        idx--;

        JuryRecord storage rec = juryRecords[taskId][idx];
        require(rec.committed, "Not committed");
        require(!rec.revealed, "Already revealed");
        require(
            rec.scoreHash == keccak256(abi.encodePacked(score, salt)),
            "Hash mismatch"
        );

        rec.score = score;
        rec.revealed = true;

        emit ScoreRevealed(taskId, msg.sender, score);
    }

    // ── 任意人：聚合 reveal 结果，执行结算 ──────────────────────
    // 条件：所有已 commit 的 Jury 均已 reveal，或 reveal 窗口已关闭
    function finalizeTask(uint256 taskId) public {
        Task storage t = tasks[taskId];
        require(t.status == Status.Deliberating, "Not deliberating");
        require(t.revealDeadline > 0, "Reveal not started");

        JuryRecord[] storage records = juryRecords[taskId];
        uint256 revealed = 0;
        bool allRevealed = true;
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].committed) {
                if (records[i].revealed) {
                    revealed++;
                } else {
                    allRevealed = false;
                }
            }
        }
        require(allRevealed || block.timestamp > t.revealDeadline, "Reveal phase ongoing");

        if (!allRevealed) {
            for (uint256 i = 0; i < records.length; i++) {
                if (records[i].committed && !records[i].revealed) {
                    juryRegistry.slash(records[i].juror, SLASH_NO_REVEAL_BPS);
                }
            }
        }

        t.juryRevealed = revealed;

        if (revealed == 0) {
            t.status = Status.Resolved;
            _transferTo(t.payer, t.escrow);
            emit TaskResolved(taskId, 0, false, t.payer);
            return;
        }

        _settle(taskId);
    }

    // ── 超时保护 ──────────────────────────────────────────────
    function claimTimeout(uint256 taskId) external {
        Task storage t = tasks[taskId];

        // 场景 1: Agent B 未在 deadline 前提交，退还 escrow + 全部 jury fee
        if (
            (t.status == Status.Created || t.status == Status.Accepted) &&
            block.timestamp > t.deadline
        ) {
            t.status = Status.Resolved;
            uint256 refund = t.escrow + t.juryReward * t.juryCount;
            _transferTo(t.payer, refund);
            emit TaskResolved(taskId, 0, false, t.payer);
            return;
        }

        // 场景 2: commit 窗口关闭 → 委托 advanceToReveal
        if (t.status == Status.ZKPassed && t.commitDeadline > 0 && block.timestamp > t.commitDeadline) {
            advanceToReveal(taskId);
            return;
        }

        // 场景 3: reveal 窗口关闭 → 委托 finalizeTask
        if (t.status == Status.Deliberating && t.revealDeadline > 0 && block.timestamp > t.revealDeadline) {
            finalizeTask(taskId);
            return;
        }

        revert("No timeout condition met");
    }

    // ── 内部：结算 ────────────────────────────────────────────
    function _settle(uint256 taskId) internal {
        Task storage t = tasks[taskId];

        // 计算平均分
        uint256 totalScore;
        uint256 revealedCount;
        JuryRecord[] storage records = juryRecords[taskId];

        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].revealed) {
                totalScore += records[i].score;
                revealedCount++;
            }
        }

        uint256 avgScore = totalScore / revealedCount;

        // Slash 偏离过大的 Jury；按时 reveal 的发固定报酬
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].revealed) {
                uint256 diff = records[i].score > avgScore
                    ? records[i].score - avgScore
                    : avgScore - records[i].score;
                if (diff > MAX_DEVIATION) {
                    juryRegistry.slash(records[i].juror, SLASH_DEVIATION_BPS);
                }
                // 固定 Jury 报酬
                if (t.juryReward > 0) {
                    _transferTo(records[i].juror, t.juryReward);
                }
                juryRegistry.setActive(records[i].juror, false);
            }
        }

        // 二元结算（escrow 已不含 jury fee）
        t.status = Status.Resolved;
        bool passed = avgScore >= t.minScore;
        address recipient = passed ? t.worker : t.payer;
        _transferTo(recipient, t.escrow);

        // 更新 Agent 声誉
        AgentStats storage stats = agentStats[t.worker];
        if (passed) {
            stats.tasksCompleted++;
        } else {
            stats.tasksFailed++;
        }
        stats.totalScore += avgScore;
        emit AgentStatsUpdated(t.worker, stats.tasksCompleted, stats.tasksFailed, stats.totalScore);

        emit TaskResolved(taskId, avgScore, passed, recipient);
    }

    // ── 内部：随机选取 Jury ────────────────────────────────────
    function _selectJury(uint256 taskId) internal {
        Task storage t = tasks[taskId];
        uint256 total = juryRegistry.getJurorCount();

        // Collect all eligible jurors first
        address[] memory eligible = new address[](total);
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            address juror = juryRegistry.getJuror(i);
            if (juryRegistry.isEligible(juror)) {
                eligible[count++] = juror;
            }
        }
        require(count >= t.juryCount, "Not enough eligible jurors");

        // Fisher-Yates shuffle: swap first juryCount positions
        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, taskId))
        );
        for (uint256 i = 0; i < t.juryCount; i++) {
            uint256 j = i + uint256(keccak256(abi.encodePacked(seed, i))) % (count - i);
            (eligible[i], eligible[j]) = (eligible[j], eligible[i]);
        }

        // Assign first juryCount jurors
        for (uint256 i = 0; i < t.juryCount; i++) {
            address juror = eligible[i];
            juryRecords[taskId].push(
                JuryRecord({
                    juror: juror,
                    scoreHash: bytes32(0),
                    score: 0,
                    committed: false,
                    revealed: false
                })
            );
            juryIndex[taskId][juror] = juryRecords[taskId].length; // 1-based
            juryRegistry.setActive(juror, true);
        }
    }

    function _transferTo(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ── 查询辅助 ──────────────────────────────────────────────
    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function getJuryRecords(uint256 taskId) external view returns (JuryRecord[] memory) {
        return juryRecords[taskId];
    }

    function getAgentStats(address agent) external view returns (AgentStats memory) {
        return agentStats[agent];
    }

    function getAssignedJurors(uint256 taskId) external view returns (address[] memory) {
        JuryRecord[] storage records = juryRecords[taskId];
        address[] memory result = new address[](records.length);
        for (uint256 i = 0; i < records.length; i++) {
            result[i] = records[i].juror;
        }
        return result;
    }
}

/// @notice snarkjs 生成的 Groth16 Verifier 接口
interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata input
    ) external view returns (bool);
}
