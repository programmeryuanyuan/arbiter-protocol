"use client";

import { useState } from "react";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

interface Props {
  taskId: number;
}

export default function RevealScoreButton({ taskId }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [score, setScore] = useState(
    Number(localStorage.getItem(`jury_score_${taskId}`) || "80")
  );
  const [salt, setSalt] = useState(
    localStorage.getItem(`jury_salt_${taskId}`) || ""
  );

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleReveal = async () => {
    if (!salt || !salt.startsWith("0x")) {
      alert("Please enter the salt (or commit first to auto-save it)");
      return;
    }

    try {
      await writeContractAsync({
        functionName: "revealScore",
        args: [BigInt(taskId), BigInt(score), salt as `0x${string}`],
      });
      notification.success("Score revealed!");
      setShowModal(false);
    } catch (err) {
      console.error("Reveal failed:", err);
      notification.error(getParsedError(err));
    }
  };

  return (
    <>
      <button className="btn btn-success btn-sm" onClick={() => setShowModal(true)}>
        Reveal Score
      </button>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">Reveal Score</h3>
            <p className="text-xs text-base-content/60 mb-3">
              Reveal your previously committed score. Must match the commitment hash.
            </p>

            <div className="space-y-3">
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
              <div>
                <label className="label-text text-sm">Salt (bytes32)</label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="input input-bordered input-sm w-full font-mono text-xs"
                  value={salt}
                  onChange={e => setSalt(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className={`btn btn-success btn-sm ${isPending ? "loading" : ""}`}
                onClick={handleReveal}
                disabled={isPending}
              >
                {isPending ? "Revealing..." : "Reveal"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </>
  );
}
