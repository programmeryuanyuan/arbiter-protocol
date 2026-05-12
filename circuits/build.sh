#!/bin/bash
# ZK 电路构建脚本
# 用法: cd circuits && bash build.sh

set -e

echo "=== Arbiter Protocol ZK Circuit Build ==="

# 1. 编译电路
echo "[1/5] 编译 circom 电路..."
circom result_verifier.circom --r1cs --wasm --sym -o .

# 2. 下载 Hermez ptau（如果不存在）
if [ ! -f pot12_final.ptau ]; then
    echo "[2/5] 下载 Hermez pot12_final.ptau..."
    curl -L -o pot12_final.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau
else
    echo "[2/5] ptau 已存在，跳过下载"
fi

# 3. Trusted Setup
echo "[3/5] Groth16 Setup..."
npx snarkjs groth16 setup result_verifier.r1cs pot12_final.ptau circuit_0000.zkey

echo "[4/5] Contribute to ceremony..."
echo "arbiter-protocol" | npx snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="arbiter"

# 4. 导出验证密钥
npx snarkjs zkey export verificationkey circuit_final.zkey verification_key.json

# 5. 导出 Solidity Verifier
echo "[5/5] 导出 Solidity Verifier..."
npx snarkjs zkey export solidityverifier circuit_final.zkey ../packages/hardhat/contracts/Verifier.sol

echo ""
echo "=== 构建完成 ==="
echo "  电路 WASM:  result_verifier_js/result_verifier.wasm"
echo "  ZKey:       circuit_final.zkey"
echo "  Verifier:   ../packages/hardhat/contracts/Verifier.sol"
echo ""
echo "下一步: 用 Verifier.sol 替换 MockVerifier.sol，更新部署脚本"
