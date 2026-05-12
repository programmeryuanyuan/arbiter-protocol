"use client";

import { useState } from "react";
import { parseEther, keccak256, stringToHex } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export default function CreateTaskButton() {
  const [showModal, setShowModal] = useState(false);
  const [worker, setWorker] = useState("");
  const [minScore, setMinScore] = useState(70);
  const [juryCount, setJuryCount] = useState(3);
  const [escrowAmount, setEscrowAmount] = useState("0.05");
  const [juryReward, setJuryReward] = useState("0.005");
  const [minLength, setMinLength] = useState(500);
  const [minFieldCount, setMinFieldCount] = useState(3);
  const [subjectiveCriteria, setSubjectiveCriteria] = useState("analysis quality and depth");

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleCreate = async () => {
    if (!worker || !worker.startsWith("0x")) {
      alert("Please enter a valid worker address");
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const fieldListHash = keccak256(stringToHex("fields"));

    try {
      const escrow = parseEther(escrowAmount);
      const reward = parseEther(juryReward);
      const totalValue = escrow + reward * BigInt(juryCount);

      await writeContractAsync({
        functionName: "createTask",
        args: [
          worker as `0x${string}`,
          { minLength: BigInt(minLength), minFieldCount: BigInt(minFieldCount), fieldListHash },
          subjectiveCriteria,
          BigInt(minScore),
          BigInt(juryCount),
          BigInt(deadline),
          reward,
        ],
        value: totalValue,
      });
      setShowModal(false);
    } catch (err) {
      console.error("Create task failed:", err);
    }
  };

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
        + Create Task
      </button>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="font-bold text-lg mb-4">Create New Task</h3>

            <div className="space-y-3">
              <div>
                <label className="label-text text-sm">Worker Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="input input-bordered input-sm w-full"
                  value={worker}
                  onChange={e => setWorker(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text text-sm">Min Score (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-bordered input-sm w-full"
                    value={minScore}
                    onChange={e => setMinScore(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label-text text-sm">Jury Count</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="input input-bordered input-sm w-full"
                    value={juryCount}
                    onChange={e => setJuryCount(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text text-sm">Escrow (MON)</label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={escrowAmount}
                    onChange={e => setEscrowAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label-text text-sm">Jury Reward (MON)</label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={juryReward}
                    onChange={e => setJuryReward(e.target.value)}
                  />
                </div>
              </div>

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

              <div>
                <label className="label-text text-sm">Subjective Criteria</label>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={subjectiveCriteria}
                  onChange={e => setSubjectiveCriteria(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className={`btn btn-primary btn-sm ${isPending ? "loading" : ""}`}
                onClick={handleCreate}
                disabled={isPending}
              >
                {isPending ? "Creating..." : "Create Task"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </>
  );
}
