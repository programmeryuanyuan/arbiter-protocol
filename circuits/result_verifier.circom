pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

/// @title ResultVerifier - ZK 格式门槛验证（pass/fail）
/// @notice 验证 Agent B 提交的结果满足客观格式要求：
///   1. commitment 绑定 contentHash（防篡改）
///   2. 字符数 >= minLength
///   3. 必填字段数 >= minFields
/// @dev 链上只看 pass/fail，原文不上链，保护隐私

template ResultVerifier() {
    // ── 私密输入（Agent B 持有，链上不可见）────────────────────
    signal input contentHash;   // 结果内容的数值哈希
    signal input length;        // 结果字符数
    signal input fieldCount;    // 包含的必填字段数

    // ── 公开输入（链上 publicSignals）──────────────────────────
    signal input minLength;     // 来自 objective.minLength
    signal input minFields;     // 来自 objective.minFieldCount
    signal input commitment;    // Agent B 提交的承诺值

    // ── 约束 1：commitment == Poseidon(contentHash) ───────────
    component hasher = Poseidon(1);
    hasher.inputs[0] <== contentHash;
    commitment === hasher.out;

    // ── 约束 2：length >= minLength ──────────────────────────
    component lenCheck = GreaterEqThan(32);   // 32-bit，最大 ~4B 字符
    lenCheck.in[0] <== length;
    lenCheck.in[1] <== minLength;
    lenCheck.out === 1;

    // ── 约束 3：fieldCount >= minFields ──────────────────────
    component fieldCheck = GreaterEqThan(16);  // 16-bit，最大 65535 字段
    fieldCheck.in[0] <== fieldCount;
    fieldCheck.in[1] <== minFields;
    fieldCheck.out === 1;
}

component main {public [minLength, minFields, commitment]} = ResultVerifier();
