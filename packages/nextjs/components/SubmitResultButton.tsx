"use client";

import { useState } from "react";
import { keccak256, toUtf8Bytes } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

interface Props {
  taskId: number;
}

export default function SubmitResultButton({ taskId }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [resultURI, setResultURI] = useState("QmTestCID123456789");
  const [minLength, setMinLength] = useState(500);
  const [minFieldCount, setMinFieldCount] = useState(3);

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleSubmit = async () => {
    if (!resultURI) {
      alert("Please enter a result URI");
      return;
    }

    // 生成 commitment（简化：用 keccak256 hash 作为 Poseidon 的替代）
    const commitment = keccak256(toUtf8Bytes(resultURI + taskId.toString()));

    // Mock proof（本地 MockVerifier 始终返回 true）
    const proofA: [bigint, bigint] = [0n, 0n];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [
      [0n, 0n],
      [0n, 0n],
    ];
    const proofC: [bigint, bigint] = [0n, 0n];
    const publicSignals: [bigint, bigint, `0x${string}`] = [
      BigInt(minLength),
      BigInt(minFieldCount),
      commitment,
    ];

    try {
      await writeContractAsync({
        functionName: "submitResult",
        args: [BigInt(taskId), commitment, resultURI, proofA, proofB, proofC, publicSignals],
      });
      notification.success("Result submitted!");
      setShowModal(false);
    } catch (err) {
      console.error("Submit result failed:", err);
      notification.error(getParsedError(err));
    }
  };

  return (
    <>
      <button className="btn btn-accent btn-sm" onClick={() => setShowModal(true)}>
        Submit Result
      </button>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg mb-4">Submit Result + ZK Proof</h3>

            <div className="space-y-3">
              <div>
                <label className="label-text text-sm">Result IPFS CID</label>
                <input
                  type="text"
                  placeholder="Qm..."
                  className="input input-bordered input-sm w-full"
                  value={resultURI}
                  onChange={e => setResultURI(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text text-sm">Min Length</label>
                  <input
                    type="number"
                    className="input input-bordered input-sm w-full"
                    value={minLength}
                    onChange={e => setMinLength(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label-text text-sm">Min Field Count</label>
                  <input
                    type="number"
                    className="input input-bordered input-sm w-full"
                    value={minFieldCount}
                    onChange={e => setMinFieldCount(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="p-3 bg-base-200 rounded-lg text-xs text-base-content/60">
                <p>Using Mock Verifier (always passes on localhost)</p>
                <p>Commitment: auto-generated from CID hash</p>
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className={`btn btn-accent btn-sm ${isPending ? "loading" : ""}`}
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "Submitting..." : "Submit Result"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </>
  );
}
