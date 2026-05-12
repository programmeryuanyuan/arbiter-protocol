interface Props {
  taskLoading: boolean;
  juryRecords: any[];
  connectedAddress: string | undefined;
  avgScore: string;
  revealedCount: number;
  minScore: number;
}

const shortenAddress = (addr: string | undefined) => {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export default function JuryPanel({
  taskLoading,
  juryRecords,
  connectedAddress,
  avgScore,
  revealedCount,
  minScore,
}: Props) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-300">
      <div className="card-body">
        <h2 className="card-title text-lg flex items-center gap-2">
          <span className="text-xl">⚖️</span> Jury Deliberation
        </h2>
        <div className="divider my-2"></div>

        {taskLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md"></span>
          </div>
        ) : (
          <>
            {/* Jury 列表 */}
            <div className="space-y-3">
              {(juryRecords || []).length === 0 ? (
                <div className="text-center py-4 text-base-content/50 text-sm">
                  No jury assigned yet
                </div>
              ) : (
                (juryRecords || []).map((jury, idx) => {
                  const isMe = connectedAddress && jury.juror.toLowerCase() === connectedAddress.toLowerCase();
                  let actionHint = "";
                  if (isMe) {
                    if (!jury.committed) actionHint = "Your turn: Commit!";
                    else if (!jury.revealed) actionHint = "Your turn: Reveal!";
                    else actionHint = "Done ✓";
                  }
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border-2 ${
                        isMe ? "bg-primary/10 border-primary" : "bg-base-200 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold">Jury #{idx + 1}</span>
                          <span className="text-xs text-base-content/50">{shortenAddress(jury.juror)}</span>
                          {isMe && (
                            <span className="badge badge-primary badge-sm">You</span>
                          )}
                        </div>
                        {jury.revealed && (
                          <span className="text-xl font-bold text-primary">{Number(jury.score)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <span className={`badge badge-sm ${jury.committed ? "badge-success" : "badge-outline badge-warning"}`}>
                            C{jury.committed ? "✓" : "○"}
                          </span>
                          <span className="text-xs text-base-content/50">Commit</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`badge badge-sm ${jury.revealed ? "badge-success" : "badge-outline badge-warning"}`}>
                            R{jury.revealed ? "✓" : "○"}
                          </span>
                          <span className="text-xs text-base-content/50">Reveal</span>
                        </div>
                        {actionHint ? (
                          <span className={`text-xs ml-auto font-semibold ${
                            actionHint === "Done ✓" ? "text-success" : "text-primary"
                          }`}>
                            {actionHint}
                          </span>
                        ) : !jury.revealed && (
                          <span className="text-xs text-warning ml-auto">Waiting...</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 平均分 */}
            {(juryRecords || []).length > 0 && (
              <>
                <div className="divider my-3"></div>
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                  <span className="font-medium">Average Score</span>
                  <span className="text-2xl font-bold text-primary">{avgScore}</span>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-xs text-base-content/60">
                    {revealedCount}/{(juryRecords || []).length} revealed
                  </span>
                  <span className="text-xs text-base-content/60">
                    Min: {minScore}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
