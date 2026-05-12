"use client";

import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

interface Props {
  taskId: number;
}

export default function ClaimTimeoutButton({ taskId }: Props) {
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ArbiterEscrow",
  });

  const handleClaim = async () => {
    try {
      await writeContractAsync({
        functionName: "claimTimeout",
        args: [BigInt(taskId)],
      });
      notification.success("Timeout claimed! Task resolved.");
    } catch (err) {
      console.error("Claim timeout failed:", err);
      notification.error(getParsedError(err));
    }
  };

  return (
    <button
      className={`btn btn-error btn-sm ${isPending ? "loading" : ""}`}
      onClick={handleClaim}
      disabled={isPending}
    >
      {isPending ? "Claiming..." : "Claim Timeout"}
    </button>
  );
}
