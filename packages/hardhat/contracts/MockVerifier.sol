// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockVerifier - 开发/测试用的 ZK Verifier Mock
/// @notice 始终返回 true，部署到测试网后替换为 snarkjs 生成的真实 Groth16 Verifier
contract MockVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[3] calldata
    ) external pure returns (bool) {
        return true;
    }
}
