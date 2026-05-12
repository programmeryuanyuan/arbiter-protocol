// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JuryRegistry - Jury 注册、Stake 和 Slash 管理
/// @notice Jury Agent 需质押保证金参与评审，违规行为将被 slash
contract JuryRegistry {
    uint256 public constant MIN_STAKE = 0.01 ether;

    struct Juror {
        uint256 stake;
        bool active; // 是否有活跃任务
    }

    mapping(address => Juror) public jurors;
    address[] public jurorList;

    address public escrowContract; // 仅 ArbiterEscrow 可调用 slash
    address public immutable owner;

    event JurorRegistered(address indexed juror, uint256 stake);
    event JurorWithdrawn(address indexed juror, uint256 amount);
    event JurorSlashed(address indexed juror, uint256 amount);

    modifier onlyEscrow() {
        require(msg.sender == escrowContract, "Only escrow");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice 设置 ArbiterEscrow 合约地址（deployer 调用一次）
    function setEscrowContract(address _escrow) external {
        require(msg.sender == owner, "Not owner");
        require(escrowContract == address(0), "Already set");
        escrowContract = _escrow;
    }

    /// @notice Jury 注册并质押
    function register() external payable {
        require(msg.value >= MIN_STAKE, "Stake too low");
        require(jurors[msg.sender].stake == 0, "Already registered");

        jurors[msg.sender] = Juror({ stake: msg.value, active: false });
        jurorList.push(msg.sender);

        emit JurorRegistered(msg.sender, msg.value);
    }

    /// @notice 无活跃任务时取回 stake
    function withdraw() external {
        Juror storage j = jurors[msg.sender];
        require(j.stake > 0, "Not registered");
        require(!j.active, "Has active task");

        uint256 amount = j.stake;
        j.stake = 0;
        _removeFromList(msg.sender);

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit JurorWithdrawn(msg.sender, amount);
    }

    /// @notice ArbiterEscrow 调用：slash Jury stake
    function slash(address juror, uint256 bps) external onlyEscrow {
        Juror storage j = jurors[juror];
        require(j.stake > 0, "Not registered");

        uint256 amount = (j.stake * bps) / 10000;
        j.stake -= amount;

        // slash 金额留在合约作为 protocol treasury
        emit JurorSlashed(juror, amount);
    }

    /// @notice ArbiterEscrow 调用：设置 Jury 活跃状态
    function setActive(address juror, bool _active) external onlyEscrow {
        jurors[juror].active = _active;
    }

    /// @notice 获取已注册 Jury 总数
    function getJurorCount() external view returns (uint256) {
        return jurorList.length;
    }

    /// @notice 获取 Jury 地址
    function getJuror(uint256 index) external view returns (address) {
        return jurorList[index];
    }

    /// @notice 检查是否已注册且有足够 stake
    function isEligible(address juror) external view returns (bool) {
        return jurors[juror].stake >= MIN_STAKE && !jurors[juror].active;
    }

    function _removeFromList(address juror) internal {
        for (uint256 i = 0; i < jurorList.length; i++) {
            if (jurorList[i] == juror) {
                jurorList[i] = jurorList[jurorList.length - 1];
                jurorList.pop();
                break;
            }
        }
    }
}
