import { expect } from "chai";
import { ethers } from "hardhat";
import { ArbiterEscrow, JuryRegistry, MockVerifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ArbiterEscrow", function () {
  let escrow: ArbiterEscrow;
  let registry: JuryRegistry;
  let verifier: MockVerifier;
  let agentA: SignerWithAddress;
  let agentB: SignerWithAddress;
  let jury1: SignerWithAddress;
  let jury2: SignerWithAddress;
  let jury3: SignerWithAddress;

  const ESCROW_AMOUNT = ethers.parseEther("0.05");
  const JURY_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [agentA, agentB, jury1, jury2, jury3] = await ethers.getSigners();

    // 部署合约
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    verifier = await MockVerifierFactory.deploy();

    const JuryRegistryFactory = await ethers.getContractFactory("JuryRegistry");
    registry = await JuryRegistryFactory.deploy();

    const ArbiterEscrowFactory = await ethers.getContractFactory("ArbiterEscrow");
    escrow = await ArbiterEscrowFactory.deploy(
      await verifier.getAddress(),
      await registry.getAddress()
    );

    // 关联
    await registry.setEscrowContract(await escrow.getAddress());

    // 注册 3 个 Jury
    await registry.connect(jury1).register({ value: JURY_STAKE });
    await registry.connect(jury2).register({ value: JURY_STAKE });
    await registry.connect(jury3).register({ value: JURY_STAKE });
  });

  // ── 辅助函数 ──────────────────────────────────────────────
  async function createTask() {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await escrow.connect(agentA).createTask(
      agentB.address,
      { minLength: 500n, minFieldCount: 3n, fieldListHash: ethers.keccak256(ethers.toUtf8Bytes("fields")) },
      "analysis quality",
      70n,  // minScore
      3n,   // juryCount
      BigInt(deadline),
      { value: ESCROW_AMOUNT }
    );
    const receipt = await tx.wait();
    return 0n; // 第一个 taskId
  }

  async function acceptTask(taskId: bigint) {
    await escrow.connect(agentB).acceptTask(taskId);
  }

  async function submitResult(taskId: bigint) {
    await escrow.connect(agentB).submitResult(
      taskId,
      ethers.zeroPadValue("0x7b", 32), // resultCommitment = 123
      "QmTestCID",
      [0n, 0n],
      [[0n, 0n], [0n, 0n]],
      [0n, 0n],
      [500n, 3n, 123n]  // publicSignals: minLength, minFields, commitment
    );
  }

  // ── 测试：创建任务 ────────────────────────────────────────
  it("should create a task with correct parameters", async function () {
    const taskId = await createTask();
    const task = await escrow.getTask(taskId);

    expect(task.payer).to.equal(agentA.address);
    expect(task.worker).to.equal(agentB.address);
    expect(task.escrow).to.equal(ESCROW_AMOUNT);
    expect(task.status).to.equal(0n); // Created
    expect(task.minScore).to.equal(70n);
    expect(task.juryCount).to.equal(3n);
  });

  it("should revert createTask without escrow", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await expect(
      escrow.connect(agentA).createTask(
        agentB.address,
        { minLength: 500n, minFieldCount: 3n, fieldListHash: ethers.keccak256(ethers.toUtf8Bytes("f")) },
        "test", 70n, 3n, BigInt(deadline)
      )
    ).to.be.revertedWith("No escrow");
  });

  // ── 测试：接单 ────────────────────────────────────────────
  it("should allow worker to accept task", async function () {
    const taskId = await createTask();
    await acceptTask(taskId);

    const task = await escrow.getTask(taskId);
    expect(task.status).to.equal(1n); // Accepted
  });

  it("should revert accept from non-worker", async function () {
    const taskId = await createTask();
    await expect(
      escrow.connect(jury1).acceptTask(taskId)
    ).to.be.revertedWith("Not worker");
  });

  // ── 测试：ZK 提交 ─────────────────────────────────────────
  it("should submit result with ZK proof", async function () {
    const taskId = await createTask();
    await acceptTask(taskId);
    await submitResult(taskId);

    const task = await escrow.getTask(taskId);
    expect(task.status).to.equal(2n); // ZKPassed
    expect(task.commitDeadline).to.be.greaterThan(0n);
  });

  // ── 测试：完整流程 → 通过 ──────────────────────────────────
  it("should complete full flow and pay worker (pass)", async function () {
    const taskId = await createTask();
    await acceptTask(taskId);
    await submitResult(taskId);

    const jurors = await escrow.getAssignedJurors(taskId);
    expect(jurors.length).to.equal(3);

    // Commit
    const scores = [82n, 79n, 84n];
    const salts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const salt = ethers.keccak256(ethers.toUtf8Bytes(`salt${i}`));
      salts.push(salt);
      const scoreHash = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32"],
        [scores[i], salt]
      );
      const jurorSigner = [jury1, jury2, jury3].find(s => s.address === jurors[i]);
      await escrow.connect(jurorSigner!).commitScore(taskId, scoreHash);
    }

    // Reveal
    const balanceBefore = await ethers.provider.getBalance(agentB.address);
    for (let i = 0; i < 3; i++) {
      const jurorSigner = [jury1, jury2, jury3].find(s => s.address === jurors[i]);
      await escrow.connect(jurorSigner!).revealScore(taskId, scores[i], salts[i]);
    }

    // 平均分 81.67 >= 70 → Agent B 拿钱
    const task = await escrow.getTask(taskId);
    expect(task.status).to.equal(4n); // Resolved
    const balanceAfter = await ethers.provider.getBalance(agentB.address);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
  });

  // ── 测试：完整流程 → 不通过 ────────────────────────────────
  it("should refund payer when score below threshold (fail)", async function () {
    const taskId = await createTask();
    await acceptTask(taskId);
    await submitResult(taskId);

    const jurors = await escrow.getAssignedJurors(taskId);

    // Commit 低分
    const scores = [50n, 55n, 48n];
    const salts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const salt = ethers.keccak256(ethers.toUtf8Bytes(`lowsalt${i}`));
      salts.push(salt);
      const scoreHash = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32"],
        [scores[i], salt]
      );
      const jurorSigner = [jury1, jury2, jury3].find(s => s.address === jurors[i]);
      await escrow.connect(jurorSigner!).commitScore(taskId, scoreHash);
    }

    // Reveal
    const balanceBefore = await ethers.provider.getBalance(agentA.address);
    for (let i = 0; i < 3; i++) {
      const jurorSigner = [jury1, jury2, jury3].find(s => s.address === jurors[i]);
      await escrow.connect(jurorSigner!).revealScore(taskId, scores[i], salts[i]);
    }

    // 平均分 51 < 70 → 退款 Agent A
    const task = await escrow.getTask(taskId);
    expect(task.status).to.equal(4n); // Resolved
    const balanceAfter = await ethers.provider.getBalance(agentA.address);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
  });

  // ── 测试：超时 ─────────────────────────────────────────────
  it("should refund payer on agent B timeout", async function () {
    const taskId = await createTask();
    await acceptTask(taskId);

    // 快进超过 deadline
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    const balanceBefore = await ethers.provider.getBalance(agentA.address);
    await escrow.claimTimeout(taskId);

    const task = await escrow.getTask(taskId);
    expect(task.status).to.equal(4n); // Resolved
    const balanceAfter = await ethers.provider.getBalance(agentA.address);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
  });

  // ── 测试：Jury 注册 ────────────────────────────────────────
  it("should register jurors with stake", async function () {
    expect(await registry.getJurorCount()).to.equal(3n);
    expect(await registry.isEligible(jury1.address)).to.be.true;
  });

  it("should revert register with low stake", async function () {
    const [, , , , , newJury] = await ethers.getSigners();
    await expect(
      registry.connect(newJury).register({ value: ethers.parseEther("0.001") })
    ).to.be.revertedWith("Stake too low");
  });
});
