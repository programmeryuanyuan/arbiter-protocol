"use client";

import { parseEther } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export default function JuryRegisterButton() {
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "JuryRegistry",
  });

  const handleRegister = async () => {
    try {
      await writeContractAsync({
        functionName: "register",
        value: parseEther("0.01"),
      });
    } catch (err) {
      console.error("Register failed:", err);
    }
  };

  return (
    <button
      className={`btn btn-secondary btn-sm ${isPending ? "loading" : ""}`}
      onClick={handleRegister}
      disabled={isPending}
    >
      {isPending ? "Registering..." : "Register as Jury"}
    </button>
  );
}
