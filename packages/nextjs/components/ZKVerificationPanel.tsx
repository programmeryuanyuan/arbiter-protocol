import CheckItem from "./CheckItem";

interface Props {
  taskLoading: boolean;
  taskData: any;
  hasResult: boolean;
  zkLengthPassed: boolean;
  zkFieldsPassed: boolean;
  zkProofVerified: boolean;
}

export default function ZKVerificationPanel({
  taskLoading,
  taskData,
  hasResult,
  zkLengthPassed,
  zkFieldsPassed,
  zkProofVerified,
}: Props) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300">
      <div className="card-body">
        <h2 className="card-title text-lg flex items-center gap-2">
          <span className="text-xl">🔐</span> ZK Verification
        </h2>
        <div className="divider my-2"></div>
        {taskLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md"></span>
          </div>
        ) : (
          <>
            <CheckItem
              label={`Length check: min ${taskData ? Number(taskData.objective.minLength) : 0} chars`}
              passed={zkLengthPassed}
            />
            <CheckItem
              label={`Fields check: min ${taskData ? Number(taskData.objective.minFieldCount) : 0} required`}
              passed={zkFieldsPassed}
            />
            <CheckItem label="ZK Proof verified on-chain" passed={zkProofVerified} />
            {hasResult && taskData && taskData.resultURI ? (
              <div className="mt-3 p-3 bg-base-200 rounded-lg">
                <div className="text-xs text-base-content/60 mb-1">Result IPFS:</div>
                <a
                  href={`https://ipfs.io/ipfs/${taskData.resultURI.replace("ipfs://", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline text-xs font-mono break-all"
                >
                  {taskData.resultURI}
                </a>
              </div>
            ) : (
              <div className="mt-3 p-3 bg-base-200 rounded-lg text-xs text-base-content/50 text-center">
                Result not submitted yet
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
