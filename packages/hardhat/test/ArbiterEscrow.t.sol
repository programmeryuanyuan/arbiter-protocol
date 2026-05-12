// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ArbiterEscrow.sol";
import "../contracts/JuryRegistry.sol";
import "../contracts/MockVerifier.sol";

contract ArbiterEscrowTest is Test {
    ArbiterEscrow escrow;
    JuryRegistry registry;
    MockVerifier verifier;

    address agentA = makeAddr("agentA");
    address agentB = makeAddr("agentB");
    address jury1 = makeAddr("jury1");
    address jury2 = makeAddr("jury2");
    address jury3 = makeAddr("jury3");

    uint256 constant ESCROW_AMOUNT = 0.05 ether;
    uint256 constant JURY_STAKE = 0.01 ether;

    function setUp() public {
        // 给测试账户 ETH
        vm.deal(agentA, 10 ether);
        vm.deal(agentB, 1 ether);
        vm.deal(jury1, 1 ether);
        vm.deal(jury2, 1 ether);
        vm.deal(jury3, 1 ether);

        // 部署合约
        verifier = new MockVerifier();
        registry = new JuryRegistry();
        escrow = new ArbiterEscrow(address(verifier), address(registry));
        registry.setEscrowContract(address(escrow));

        // 注册 3 个 Jury
        vm.prank(jury1);
        registry.register{value: JURY_STAKE}();
        vm.prank(jury2);
        registry.register{value: JURY_STAKE}();
        vm.prank(jury3);
        registry.register{value: JURY_STAKE}();
    }

    // ── 辅助函数 ──────────────────────────────────────────────
    function _createTask() internal returns (uint256) {
        vm.prank(agentA);
        return escrow.createTask{value: ESCROW_AMOUNT}(
            agentB,
            ArbiterEscrow.ObjectiveCriteria({
                minLength: 500,
                minFieldCount: 3,
                fieldListHash: keccak256("fields")
            }),
            "analysis quality",
            70,  // minScore
            3,   // juryCount
            block.timestamp + 3600
        );
    }

    function _acceptTask(uint256 taskId) internal {
        vm.prank(agentB);
        escrow.acceptTask(taskId);
    }

    function _submitResult(uint256 taskId) internal {
        vm.prank(agentB);
        escrow.submitResult(
            taskId,
            bytes32(uint256(123)), // resultCommitment
            "QmTestCID",
            [uint256(0), uint256(0)],
            [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
            [uint256(0), uint256(0)],
            [uint256(500), uint256(3), uint256(123)] // publicSignals: minLength, minFields, commitment
        );
    }

    // ── 测试：创建任务 ────────────────────────────────────────
    function test_CreateTask() public {
        uint256 taskId = _createTask();

        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(t.payer, agentA);
        assertEq(t.worker, agentB);
        assertEq(t.escrow, ESCROW_AMOUNT);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Created));
        assertEq(t.minScore, 70);
        assertEq(t.juryCount, 3);
    }

    function test_CreateTask_RevertNoEscrow() public {
        vm.prank(agentA);
        vm.expectRevert("No escrow");
        escrow.createTask(
            agentB,
            ArbiterEscrow.ObjectiveCriteria(500, 3, keccak256("f")),
            "test", 70, 3, block.timestamp + 3600
        );
    }

    // ── 测试：接单 ────────────────────────────────────────────
    function test_AcceptTask() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);

        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Accepted));
    }

    function test_AcceptTask_RevertNotWorker() public {
        uint256 taskId = _createTask();

        vm.prank(jury1); // 非 worker
        vm.expectRevert("Not worker");
        escrow.acceptTask(taskId);
    }

    // ── 测试：提交结果 + ZK ───────────────────────────────────
    function test_SubmitResult() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);
        _submitResult(taskId);

        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.ZKPassed));
        assertTrue(t.commitDeadline > 0);
    }

    // ── 测试：完整 Commit-Reveal 流程 + 结算（通过）──────────
    function test_FullFlow_Pass() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);
        _submitResult(taskId);

        // 获取被选中的 Jury
        address[] memory jurors = escrow.getAssignedJurors(taskId);
        assertEq(jurors.length, 3);

        // Commit 阶段
        uint256[] memory scores = new uint256[](3);
        bytes32[] memory salts = new bytes32[](3);
        scores[0] = 82; scores[1] = 79; scores[2] = 84;

        for (uint256 i = 0; i < 3; i++) {
            salts[i] = keccak256(abi.encodePacked("salt", i));
            bytes32 scoreHash = keccak256(abi.encodePacked(scores[i], salts[i]));
            vm.prank(jurors[i]);
            escrow.commitScore(taskId, scoreHash);
        }

        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Deliberating));
        assertEq(t.juryCommitted, 3);
        assertTrue(t.revealDeadline > 0);

        // Reveal 阶段
        uint256 agentBBalanceBefore = agentB.balance;
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(jurors[i]);
            escrow.revealScore(taskId, scores[i], salts[i]);
        }

        // 验证结算：平均分 81.67 >= 70 → Agent B 获得 escrow
        t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Resolved));
        assertEq(agentB.balance, agentBBalanceBefore + ESCROW_AMOUNT);
    }

    // ── 测试：Jury 评分低于及格线 → 退款 Agent A ─────────────
    function test_FullFlow_Fail() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);
        _submitResult(taskId);

        address[] memory jurors = escrow.getAssignedJurors(taskId);

        // Commit：低分
        uint256[] memory scores = new uint256[](3);
        bytes32[] memory salts = new bytes32[](3);
        scores[0] = 50; scores[1] = 55; scores[2] = 48;

        for (uint256 i = 0; i < 3; i++) {
            salts[i] = keccak256(abi.encodePacked("lowsalt", i));
            bytes32 scoreHash = keccak256(abi.encodePacked(scores[i], salts[i]));
            vm.prank(jurors[i]);
            escrow.commitScore(taskId, scoreHash);
        }

        // Reveal
        uint256 agentABalanceBefore = agentA.balance;
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(jurors[i]);
            escrow.revealScore(taskId, scores[i], salts[i]);
        }

        // 平均分 51 < 70 → 退款 Agent A
        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Resolved));
        assertEq(agentA.balance, agentABalanceBefore + ESCROW_AMOUNT);
    }

    // ── 测试：Agent B 超时未提交 → Agent A 取回 ──────────────
    function test_Timeout_AgentB() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);

        // 跳过 deadline
        vm.warp(block.timestamp + 3601);

        uint256 agentABalanceBefore = agentA.balance;
        escrow.claimTimeout(taskId);

        assertEq(agentA.balance, agentABalanceBefore + ESCROW_AMOUNT);
        ArbiterEscrow.Task memory t = escrow.getTask(taskId);
        assertEq(uint256(t.status), uint256(ArbiterEscrow.Status.Resolved));
    }

    // ── 测试：Jury 注册和 Stake ───────────────────────────────
    function test_JuryRegister() public {
        assertEq(registry.getJurorCount(), 3);
        assertTrue(registry.isEligible(jury1));
    }

    function test_JuryRegister_RevertLowStake() public {
        address newJury = makeAddr("newJury");
        vm.deal(newJury, 1 ether);

        vm.prank(newJury);
        vm.expectRevert("Stake too low");
        registry.register{value: 0.001 ether}();
    }

    // ── 测试：Commit hash 不匹配 → revert ────────────────────
    function test_RevealWrongHash() public {
        uint256 taskId = _createTask();
        _acceptTask(taskId);
        _submitResult(taskId);

        address[] memory jurors = escrow.getAssignedJurors(taskId);

        // Commit
        bytes32 salt = keccak256("salt");
        bytes32 scoreHash = keccak256(abi.encodePacked(uint256(80), salt));
        vm.prank(jurors[0]);
        escrow.commitScore(taskId, scoreHash);

        // 尝试用错误分数 reveal
        // 需要先让所有 jury commit 才能 reveal
        for (uint256 i = 1; i < jurors.length; i++) {
            bytes32 s = keccak256(abi.encodePacked("s", i));
            bytes32 h = keccak256(abi.encodePacked(uint256(75), s));
            vm.prank(jurors[i]);
            escrow.commitScore(taskId, h);
        }

        vm.prank(jurors[0]);
        vm.expectRevert("Hash mismatch");
        escrow.revealScore(taskId, 99, salt); // 错误分数
    }
}
