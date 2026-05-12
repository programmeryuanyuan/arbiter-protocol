"use client";

import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface Props {
  taskId: number;
}

export default function AcceptTaskButton({ taskId }: Props) {
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleAccept = async () => {
    try {
      await writeContractAsync({
        functionName: "acceptTask",
        args: [BigInt(taskId)],
      });
    } catch (err) {
      console.error("Accept task failed:", err);
    }
  };

  return (
    <button
      className={`btn btn-accent btn-sm ${isPending ? "loading" : ""}`}
      onClick={handleAccept}
      disabled={isPending}
    >
      {isPending ? "Accepting..." : "Accept Task"}
    </button>
  );
}
