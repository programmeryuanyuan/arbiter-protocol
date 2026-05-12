import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署 Arbiter Protocol 全套合约:
 * 1. Groth16Verifier (snarkjs 生成的真实 ZK Verifier)
 * 2. JuryRegistry (Jury 注册 + Stake + Slash)
 * 3. ArbiterEscrow (主合约：状态机 + Escrow + 结算)
 */
const deployArbiter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // 1. 部署 Groth16Verifier (snarkjs 生成)
  const verifier = await deploy("Groth16Verifier", {
    from: deployer,
    log: true,
    autoMine: true,
  });
  console.log("Groth16Verifier deployed to:", verifier.address);

  // 2. 部署 JuryRegistry
  const juryRegistry = await deploy("JuryRegistry", {
    from: deployer,
    log: true,
    autoMine: true,
  });
  console.log("JuryRegistry deployed to:", juryRegistry.address);

  // 3. 部署 ArbiterEscrow
  const arbiterEscrow = await deploy("ArbiterEscrow", {
    from: deployer,
    args: [verifier.address, juryRegistry.address],
    log: true,
    autoMine: true,
  });
  console.log("ArbiterEscrow deployed to:", arbiterEscrow.address);

  // 4. 设置 JuryRegistry 的 escrow 地址
  const registryContract = await hre.ethers.getContract<any>("JuryRegistry", deployer);
  const currentEscrow = await registryContract.escrowContract();
  if (currentEscrow === "0x0000000000000000000000000000000000000000") {
    const gas = await registryContract.setEscrowContract.estimateGas(arbiterEscrow.address);
    const tx = await registryContract.setEscrowContract(arbiterEscrow.address, { gasLimit: (gas * 120n) / 100n });
    await tx.wait();
    console.log("JuryRegistry.setEscrowContract ->", arbiterEscrow.address);
  }
};

export default deployArbiter;
deployArbiter.tags = ["ArbiterProtocol"];
