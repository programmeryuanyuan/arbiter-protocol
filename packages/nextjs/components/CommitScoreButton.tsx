"use client";

import { useState } from "react";
import { keccak256, toHex, encodePacked } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface Props {
  taskId: number;
}

export default function CommitScoreButton({ taskId }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [score, setScore] = useState(80);

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleCommit = async () => {
    if (score < 0 || score > 100) {
      alert("Score must be 0-100");
      return;
    }

    // 生成随机 salt
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));

    // keccak256(abi.encodePacked(score, salt))
    const hash = keccak256(
      encodePacked(["uint256", "bytes32"], [BigInt(score), salt])
    );

    try {
      await writeContractAsync({
        functionName: "commitScore",
        args: [BigInt(taskId), hash],
      });
      // 保存 salt 和 score 到 localStorage 以便后续 reveal
      localStorage.setItem(`jury_salt_${taskId}`, salt);
      localStorage.setItem(`jury_score_${taskId}`, score.toString());
      setShowModal(false);
    } catch (err) {
      console.error("Commit failed:", err);
    }
  };

  return (
    <>
      <button className="btn btn-warning btn-sm" onClick={() => setShowModal(true)}>
        Commit Score
      </button>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">Commit Score (Hidden)</h3>
            <p className="text-xs text-base-content/60 mb-3">
              Your score will be hidden until all jurors commit. A random salt is generated automatically.
            </p>
            <div>
              <label className="label-text text-sm">Score (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="input input-bordered input-sm w-full"
                value={score}
                onChange={e => setScore(Number(e.target.value))}
              />
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className={`btn btn-warning btn-sm ${isPending ? "loading" : ""}`}
                onClick={handleCommit}
                disabled={isPending}
              >
                {isPending ? "Committing..." : "Commit"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </>
  );
}
